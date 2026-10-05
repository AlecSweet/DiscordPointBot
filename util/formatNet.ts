import formatPoints from "./formatPoints"
import { ANSI_GREEN, ANSI_RED, ANSI_RESET } from "./ansi"

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
