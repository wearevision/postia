import type { Page } from "@playwright/test"

/** Signing stays locked until the end of the text has been on screen; scroll there like a person would. */
export async function leerHastaElFinal(page: Page): Promise<void> {
  await page.getByTestId("fin-del-texto").scrollIntoViewIfNeeded()
}
