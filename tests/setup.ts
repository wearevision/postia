import "@testing-library/jest-dom/vitest"
import { afterAll, afterEach, beforeAll } from "vitest"
import { servidor } from "./msw"

// Every unhandled request fails the test: nothing real is ever called from a unit test.
beforeAll(() => servidor.listen({ onUnhandledRequest: "error" }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())
