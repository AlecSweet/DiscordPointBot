const MAX_MESSAGE_LENGTH = 2000

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
    return build(trimmed.length > room ? trimmed.slice(trimmed.length - room) : trimmed)
}

export default fitToMessageLimit
