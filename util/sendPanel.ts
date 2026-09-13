import { MessageAttachment } from "discord.js";

export interface IPanel {
    content: string
    files?: MessageAttachment[]
}

const sendPanel = async (send: (panel: IPanel) => Promise<unknown>, panel: IPanel): Promise<void> => {
    if (panel.files === undefined) {
        await send(panel)
        return
    }

    await send(panel).catch(async (err) => {
        console.log(err)
        await send({content: panel.content})
    })
}

export default sendPanel
