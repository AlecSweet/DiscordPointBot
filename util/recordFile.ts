import { MessageAttachment } from "discord.js";

const recordFile = (record: string | undefined, name: string): {files?: MessageAttachment[]} =>
    record === undefined ? {} : {files: [new MessageAttachment(Buffer.from(record), name)]}

export default recordFile
