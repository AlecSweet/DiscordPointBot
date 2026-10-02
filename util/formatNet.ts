import formatPoints from "./formatPoints"
import { ANSI_GREEN, ANSI_RED, ANSI_RESET, dimSeparators } from "./ansi"

const formatNet = (net: number): string => {
    if (net > 0) {
        return `${ANSI_GREEN}+${dimSeparators(formatPoints(net), ANSI_GREEN)}${ANSI_RESET}`
    }
    if (net < 0) {
        return `${ANSI_RED}${dimSeparators(formatPoints(net), ANSI_RED)}${ANSI_RESET}`
    }
    return dimSeparators(formatPoints(net))
}

export default formatNet
