import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {
  code = "UNSAFE_URL";

  constructor() {
    super("The URL is invalid or points to an unsafe network address.");
    this.name = "UnsafeUrlError";
  }
}

function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce(
    (value, part) => value * 256 + Number(part),
    0
  );
}

function ipv4InCidr(ip: string, network: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;

  return (
    (ipv4ToNumber(ip) & mask) ===
    (ipv4ToNumber(network) & mask)
  );
}

const BLOCKED_IPV4 = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

function ipv4IsUnsafe(ip: string): boolean {
  if (isIP(ip) !== 4) return true;

  return BLOCKED_IPV4.some(([network, bits]) =>
    ipv4InCidr(ip, network, bits)
  );
}

function ipv6ToBigInt(ip: string): bigint {
  let address = ip.toLowerCase();

  // Convert an embedded IPv4 address into two IPv6 groups.
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    const ipv4 = address.slice(lastColon + 1);

    if (isIP(ipv4) !== 4) throw new UnsafeUrlError();

    const value = ipv4ToNumber(ipv4);
    const first = ((value >>> 16) & 0xffff).toString(16);
    const second = (value & 0xffff).toString(16);

    address = address.slice(0, lastColon) + ":" + first + ":" + second;
  }

  const halves = address.split("::");

  if (halves.length > 2) throw new UnsafeUrlError();

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1]
    ? halves[1].split(":")
    : [];

  const missing = 8 - left.length - right.length;

  if (
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  ) {
    throw new UnsafeUrlError();
  }

  const groups = [
    ...left,
    ...Array(missing).fill("0"),
    ...right,
  ];

  if (groups.length !== 8) throw new UnsafeUrlError();

  return groups.reduce((result, group) => {
    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      throw new UnsafeUrlError();
    }

    return (result << 16n) | BigInt(parseInt(group, 16));
  }, 0n);
}

function ipv6InCidr(ip: string, network: string, bits: number): boolean {
  const mask = ((1n << BigInt(bits)) - 1n) << BigInt(128 - bits);

  return (
    (ipv6ToBigInt(ip) & mask) ===
    (ipv6ToBigInt(network) & mask)
  );
}

const BLOCKED_IPV6 = [
  ["2001::", 23],
  ["2001:2::", 48],
  ["2001:db8::", 32],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2002::", 16],
  ["3fff::", 20],
] as const;

function ipv6IsUnsafe(ip: string): boolean {
  if (isIP(ip) !== 6) return true;

  // Only allow globally routable unicast IPv6 (2000::/3).
  if (!ipv6InCidr(ip, "2000::", 3)) return true;

  return BLOCKED_IPV6.some(([network, bits]) =>
    ipv6InCidr(ip, network, bits)
  );
}

function addressIsUnsafe(address: string): boolean {
  const family = isIP(address);

  if (family === 4) return ipv4IsUnsafe(address);
  if (family === 6) return ipv6IsUnsafe(address);

  return true;
}

export async function assertSafeUrl(input: string): Promise<URL> {
  try {
    if (
      typeof input !== "string" ||
      input.length === 0 ||
      input.length > 2048
    ) {
      throw new UnsafeUrlError();
    }

    const url = new URL(input);
    const authority = input.match(/^https:\/\/([^/?#]*)/i)?.[1];
 
    if (!authority || authority.includes("@")) {
  throw new UnsafeUrlError();
}

    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      throw new UnsafeUrlError();
    }

    const hostname = url.hostname
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^\[|\]$/g, "");

    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".test") ||
      hostname.endsWith(".invalid")
    ) {
      throw new UnsafeUrlError();
    }
    const family = isIP(hostname);

    if (family !== 0) {
      if (addressIsUnsafe(hostname)) {
        throw new UnsafeUrlError();
      }

      return url;
    }
    if (!hostname.includes(".")) {
      throw new UnsafeUrlError();
    }

    // Reject malformed numeric IP representations.
    if (/^[0-9.]+$/.test(hostname)) {
      throw new UnsafeUrlError();
    }

    const addresses = await lookup(hostname, {
      all: true,
      order: "verbatim",
    });

    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => addressIsUnsafe(address))
    ) {
      throw new UnsafeUrlError();
    }

    return url;
  } catch {
    throw new UnsafeUrlError();
  }
}