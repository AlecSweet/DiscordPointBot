import { BaseMessageComponentOptions, Message, MessageActionRowOptions, MessageComponentInteraction } from "discord.js";
import { MAX_MESSAGE_LENGTH } from "./fitToMessageLimit";

const HISTORY_MS = 15 * 60 * 1000
const WIDEST_LABEL = ' (99 of 99)'

type ActionRow = Required<BaseMessageComponentOptions> & MessageActionRowOptions

export const historyButton = (customId: string, label: string): ActionRow[] => [{
    type: 'ACTION_ROW',
    components: [{type: 'BUTTON', label: label, style: 'SECONDARY', customId: customId}]
}]

export const toPages = (build: (body: string, label: string) => string, lines: string[]): string[] => {
    const room = MAX_MESSAGE_LENGTH - build('', WIDEST_LABEL).length
    const pages: string[][] = [[]]
    for (const line of lines) {
        const page = pages[pages.length - 1]
        if (page.length && page.join('\n').length + line.length + 1 > room) {
            pages.push([line])
        } else {
            page.push(line)
        }
    }

    return pages.map((page, index) =>
        build(page.join('\n'), pages.length > 1 ? ` (${index + 1} of ${pages.length})` : ''))
}

export const watchFullHistory = (panel: Message<boolean>, customId: string, getPages: () => string[]) => {
    const collector = panel.createMessageComponentCollector({
        filter: (i: MessageComponentInteraction) => i.customId === customId,
        time: HISTORY_MS
    })

    collector.on('collect', async i => {
        const pages = getPages()
        await i.reply({content: pages[0], ephemeral: true}).catch((err) => console.log(err))
        for (const page of pages.slice(1)) {
            await i.followUp({content: page, ephemeral: true}).catch((err) => console.log(err))
        }
    })

    collector.on('end', async () => {
        await panel.edit({components: []}).catch((err) => console.log(err))
    })
}
