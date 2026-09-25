import { MessageAttachment } from "discord.js";

export interface IPanel {
    content: string
    files?: MessageAttachment[]
    fallbackContent?: string
}

const sendPanel = async (send: (panel: IPanel) => Promise<unknown>, {fallbackContent, ...panel}: IPanel): Promise<void> => {
    if (panel.files === undefined) {
        await send(panel)
        return
    }

    await send(panel).catch(async (err) => {
        console.log(err)
        await send({content: fallbackContent ?? panel.content})
    })
}

export default sendPanel
