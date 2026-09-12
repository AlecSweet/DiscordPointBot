import { claimDaily } from "../util/claimUtil";
import textCommand from "../util/textCommand";
import withUserLock from "../util/userLock";

const daily = textCommand({
    name: 'daily',
    category: 'claim daily',
    description: 'claim points',
    cooldown: '3s',
}, async (ctx) => {
    await withUserLock(ctx.authorId, ctx.message, async (user) => {
        await claimDaily(user, ctx.message)
    })
})

export default daily
