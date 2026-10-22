import { expect, test } from "bun:test";
import { oidcUrl, publicAddress } from "../server/oidc-network";

test.each([
  "0.0.0.0",
  "0.255.255.255",
  "10.0.0.1",
  "10.255.255.255",
  "100.64.0.0",
  "100.127.255.255",
  "127.0.0.1",
  "127.255.255.255",
  "169.254.169.254",
  "172.16.0.0",
  "172.31.255.255",
  "192.0.0.1",
  "192.0.2.1",
  "192.168.0.1",
  "192.168.255.255",
  "198.18.0.0",
  "198.19.255.255",
  "198.51.100.1",
  "203.0.113.1",
  "224.0.0.1",
  "239.255.255.255",
  "240.0.0.1",
  "255.255.255.255",
  "::",
  "::1",
  "::ffff:127.0.0.1",
  "::ffff:169.254.169.254",
  "::ffff:8.8.8.8",
  "::7f00:1",
  "fc00::1",
  "fd00::1",
  "fe80::1",
  "ff02::1",
  "64:ff9b::a00:1",
  "2001::1",
  "2001:db8::1",
  "2002:7f00:1::1",
  "3fff::1",
  "localhost",
  "127.1",
  "2130706433",
  "0x7f000001",
  "not-an-address",
  "",
])("OIDC network rejects non-public or ambiguous address %s", (address) => {
  expect(publicAddress(address)).toBe(false);
});

test.each([
  "1.1.1.1",
  "8.8.8.8",
  "100.63.255.255",
  "100.128.0.0",
  "172.15.255.255",
  "172.32.0.0",
  "198.17.255.255",
  "198.20.0.0",
  "2606:4700:4700::1111",
  "2001:4860:4860::8888",
])("OIDC network permits public address %s", (address) => {
  expect(publicAddress(address)).toBe(true);
});

test.each([
  "http://id.example.com/token",
  "file:///etc/passwd",
  "ftp://id.example.com",
  "//id.example.com/token",
  "https://user@id.example.com/token",
  "https://user:secret@id.example.com/token",
  "https://:secret@id.example.com",
  "https://id.example.com/token#fragment",
  "https://id.example.com:80/token",
  "https://id.example.com:444/token",
  "https://id.example.com:8443/token",
  "not-a-url",
])("OIDC URL rejects unsafe endpoint syntax %s", (value) => {
  expect(() => oidcUrl(value)).toThrow();
});

test("OIDC URL permits HTTPS endpoints and preserves their query", () => {
  expect(
    oidcUrl("https://id.example.com:443/tenant/token?version=2").href,
  ).toBe("https://id.example.com/tenant/token?version=2");
});

test.each([
  "https://127.1",
  "https://2130706433",
  "https://0x7f000001",
  "https://[::1]",
  "https://[::ffff:127.0.0.1]",
])("URL normalization cannot hide a private address: %s", (value) => {
  const host = oidcUrl(value).hostname.replace(/^\[|\]$/g, "");
  expect(publicAddress(host)).toBe(false);
});
