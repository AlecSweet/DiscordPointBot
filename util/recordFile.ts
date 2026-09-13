import { MessageAttachment } from "discord.js";

const recordFile = (record: string, name: string): MessageAttachment =>
    new MessageAttachment(Buffer.from(record), name)

export default recordFile
