const ESC = String.fromCharCode(27)
const ANSI_RESET = `${ESC}[0m`
const ANSI_GREEN = `${ESC}[0;32m`
const ANSI_RED = `${ESC}[0;31m`

const formatNet = (net: number): string => {
    if (net > 0) {
        return `${ANSI_GREEN}+${net}${ANSI_RESET}`
    }
    if (net < 0) {
        return `${ANSI_RED}${net}${ANSI_RESET}`
    }
    return `${net}`
}

export default formatNet
