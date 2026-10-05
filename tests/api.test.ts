import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { api } from "../lib/api";
const fetchMock = spyOn(globalThis, "fetch");
afterEach(() => fetchMock.mockReset());
afterAll(() => fetchMock.mockRestore());

test("an empty server error shows a readable message instead of a JSON parsing error", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
  await expect(
    api("/auth/sign-in/username", { username: "test" }),
  ).rejects.toThrow("Something went wrong. Please try again.");
});

test("API errors retain the server's explanation", async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json({ message: "Invalid credentials" }, { status: 401 }),
  );
  await expect(api("/me")).rejects.toThrow("Invalid credentials");
});

test("successful API responses are returned unchanged", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
  const result = await api<{ ok: boolean }>("/health");
  expect(result.ok).toBe(true);
});
