import { Message } from "discord.js";
import { IReplyable } from "./userLock";
import sendPanel, { IPanel } from "./sendPanel";

const BUTTON_LIFE_MS = 3 * 60 * 1000

interface IEphemeralButton {
    title: string
    label: string
    build: (replyTo: IReplyable, userId: string) => Promise<IPanel | undefined>
}

const ephemeralButton = async (message: Message<boolean>, {title, label, build}: IEphemeralButton): Promise<void> => {
    const buttonMessage = await message.reply({
        content: title,
        components: [{
            type: 1,
            components: [
                {
                    type: 2,
                    label: label,
                    style: 1,
                    customId: "show"
                }
            ]
        }]
    })

    const buttonCollector = buttonMessage.createMessageComponentCollector({ time: BUTTON_LIFE_MS })

    buttonCollector.on('collect', async i => {
        await i.deferReply({ephemeral: true}).catch((err) => console.log(err))
        const panel = await build({reply: (options) => i.editReply(options)}, i.user.id)
            .catch((err): undefined => { console.log(err); return undefined })
        if (panel === undefined) {
            return
        }
        await sendPanel(options => i.editReply(options), panel).catch((err) => console.log(err))
    })

    buttonCollector.on('end', async () => {
        await buttonMessage.delete().catch((err) => console.log(err))
    })
}

export default ephemeralButton
