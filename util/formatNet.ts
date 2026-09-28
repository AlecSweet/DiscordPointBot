import formatPoints from "./formatPoints"

const ESC = String.fromCharCode(27)
const ANSI_RESET = `${ESC}[0m`
const ANSI_GREEN = `${ESC}[0;32m`
const ANSI_RED = `${ESC}[0;31m`

const formatNet = (net: number): string => {
    if (net > 0) {
        return `${ANSI_GREEN}+${formatPoints(net)}${ANSI_RESET}`
    }
    if (net < 0) {
        return `${ANSI_RED}${formatPoints(net)}${ANSI_RESET}`
    }
    return `${formatPoints(net)}`
}

export default formatNet
