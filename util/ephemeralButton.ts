import { Message, MessageAttachment } from "discord.js";
import { IReplyable } from "./userLock";
import * as dotenv from "dotenv"
dotenv.config()

const BUTTON_LIFE_MS = 3 * 60 * 1000

export interface IButtonPanel {
    content: string
    files?: MessageAttachment[]
}

interface IEphemeralButton {
    title: string
    command: string
    label: string
    build: (replyTo: IReplyable) => Promise<IButtonPanel | undefined>
}

const ephemeralButton = async (message: Message<boolean>, {title, command, label, build}: IEphemeralButton): Promise<void> => {
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
        const panel = await build({reply: (options) => i.editReply(options)})
            .catch((err): undefined => { console.log(err); return undefined })
        if (panel === undefined) {
            return
        }
        await i.editReply(panel).catch((err) => console.log(err))
    })

    buttonCollector.on('end', async () => {
        await buttonMessage.edit({
            content: `${title} expired, run !${command} again ${process.env.SHRUGGERS_EMOJI}`,
            components: []
        }).catch((err) => console.log(err))
    })
}

export default ephemeralButton
