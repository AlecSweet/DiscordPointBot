import { IUser } from "../db/user"
import noMutexErrorMessage from "./noMutexErrorMessage"
import { settleUser } from "./userUtil"
import { userMutexes } from "./userMutexes"

export interface IReplyable {
    reply: (options: {content: string}) => unknown
}

const withUserLock = async <T>(
    id: string,
    replyTo: IReplyable,
    run: (user: IUser) => Promise<T>
): Promise<T | undefined> => {
    const userMutex = userMutexes.get(id)
    if (!userMutex) {
        await replyTo.reply({content: noMutexErrorMessage})
        return undefined
    }

    return await userMutex
        .runExclusive(async () => await run(await settleUser(id)))
        .catch((err): undefined => { console.log(err); return undefined })
}

export default withUserLock
