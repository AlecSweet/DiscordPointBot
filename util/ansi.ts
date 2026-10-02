const ESC = String.fromCharCode(27)

export const ANSI_RESET = `${ESC}[0m`
export const ANSI_GREEN = `${ESC}[0;32m`
export const ANSI_RED = `${ESC}[0;31m`
export const ANSI_GRAY = `${ESC}[0;30m`

export const dimSeparators = (text: string, resume = ANSI_RESET): string =>
    text.replace(/,/g, `${ANSI_GRAY},${resume}`)
