export const MAX_MESSAGE_LENGTH = 2000

const ESC = String.fromCharCode(27)

const startOfKeptText = (text: string, room: number): number => {
    const ansi = new RegExp(ESC + '\\[[0-9;]*m', 'g')
    let at = text.length - room
    for (let found = ansi.exec(text); found !== null; found = ansi.exec(text)) {
        if (found.index < at && at < found.index + found[0].length) at = found.index + found[0].length
    }
    return at
}

const fitToMessageLimit = (build: (addon: string) => string, addon: string): string => {
    const content = build(addon)
    if (content.length <= MAX_MESSAGE_LENGTH) {
        return content
    }

    const room = MAX_MESSAGE_LENGTH - (content.length - addon.length)
    if (room <= 0) {
        return build('')
    }

    const lines = addon.split('\n')
    while (lines.length > 1 && lines.join('\n').length > room) {
        lines.shift()
    }

    const trimmed = lines.join('\n')
    return build(trimmed.length > room ? trimmed.slice(startOfKeptText(trimmed, room)) : trimmed)
}

export default fitToMessageLimit
