import { claimMonthly } from "../util/claimUtil";
import textCommand from "../util/textCommand";
import withUserLock from "../util/userLock";

const monthly = textCommand({
    name: 'monthly',
    category: 'claim monthly',
    description: 'claim points',
    cooldown: '3s',
}, async (ctx) => {
    await withUserLock(ctx.authorId, ctx.message, async (user) => {
        await claimMonthly(user, ctx.message)
    })
})

export default monthly
