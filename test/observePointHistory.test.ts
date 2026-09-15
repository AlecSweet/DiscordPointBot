import { Message } from "discord.js"
import { betFacts, challengeFact, IBetFact, IChallengeFact, linkBets, linkChallenges, observe, Observation } from "../scripts/observePointHistory"

const ESC = String.fromCharCode(27)

let failures = 0
let passes = 0

const AT = new Date("2023-05-01T12:00:00Z")

interface IFakeOptions {
    repliedUser?: string
    interactionUser?: string
    reference?: string
    id?: string
    at?: Date
    editedAt?: Date
    thread?: string
}

const fake = (content: string, options: IFakeOptions = {}) => ({
    id: options.id ?? "bot",
    channelId: options.thread ?? "channel",
    content: content,
    createdAt: options.at ?? AT,
    editedAt: options.editedAt ?? null,
    reference: options.reference ? {messageId: options.reference} : null,
    attachments: {find: () => undefined},
    mentions: {repliedUser: options.repliedUser ? {id: options.repliedUser} : null},
    interaction: options.interactionUser ? {user: {id: options.interactionUser}} : null
}) as unknown as Message<boolean>

const summarize = (observations: Observation[]): string => observations
    .map(observation => observation.kind === "change"
        ? `${observation.userId} ${observation.delta > 0 ? "+" : ""}${observation.delta} -> ${observation.balance} ${observation.reason}/${observation.command}@${observation.messageId}`
        : `${observation.userId} = ${observation.balance}@${observation.messageId}`)
    .join(" | ")

const check = (name: string, got: string, expected: string) => {
    if (got === expected) { passes++; console.log(`  PASS  ${name}  [${got}]`) }
    else { failures++; console.log(`  FAIL  ${name} -- expected [${expected}], got [${got}]`) }
}

const minutes = (count: number): Date => new Date(AT.getTime() + count * 60000)

const reply = {repliedUser: "111", reference: "cmd"}

const alternating = `**<@666>'s Flips**
\`\`\`ansi
Points: 1000 (0)   Flip: 4/4 (2-2)   Bet: 100

1) ✅ 1100
2) ❌ 1000
3) ✅ 1100
4) ❌ 1000
\`\`\`
:shruggers:`

const busted = `**<@999>'s Martinelli**
\`\`\`ansi
Points: 400 (${ESC}[0;31m-600${ESC}[0m)   Win: 1/5   Next Bet: 800

1) ✅ 100
2) ❌ 100  ❌ 200  ❌ 400
\`\`\`
You ain't got 800. Sit`

const scrolledLadder = `**<@999>'s Martinelli**
\`\`\`ansi
Points: 400 (${ESC}[0;31m-600${ESC}[0m)   Win: 1/5   Next Bet: 800

2) ❌ 100  ❌ 200  ❌ 400
\`\`\`
You ain't got 800. Sit`

const scrolledFlips = `**<@666>'s Flips**
\`\`\`ansi
Points: 1700 (${ESC}[0;32m+700${ESC}[0m)   Flip: 7/7 (7-0)   Bet: 100

3) ✅ 1300
4) ✅ 1400
5) ✅ 1500
6) ✅ 1600
7) ✅ 1700
\`\`\`
Up 700 points :nice:`

const tests: {name: string, message: Message<boolean>, record?: string, expected: string}[] = [
    {name: "a flip win is a change to the replied user with the balance it left",
        message: fake(`You won 50 points :nice: You've got 1234 points now. You rolled 200 of 256`, reply),
        expected: "111 +50 -> 1234 flip/flip@cmd"},
    {name: "a flip loss is a change down to the balance it left",
        message: fake(`:smodge: 50 points deleted, later. You're down to 900 points. You rolled 20 of 256`, reply),
        expected: "111 -50 -> 900 flip/flip@cmd"},
    {name: "a flip loss into the negatives keeps its sign",
        message: fake(`:smodge: 50 points deleted, later. You're down to -50 points. You rolled 20 of 256`, reply),
        expected: "111 -50 -> -50 flip/flip@cmd"},
    {name: "the 2022 flip wording still parses",
        message: fake(`You won 50 points  You've got 4321 points now. You rolled a 200`, reply),
        expected: "111 +50 -> 4321 flip/flip@cmd"},
    {name: "a gift moves points out of the giver and into the receiver, whose balance is unknown",
        message: fake(`You gave <@333> 20 points :nice: You now have 480 points`, reply),
        expected: "111 -20 -> 480 giftSent/give@cmd | 333 +20 -> null giftReceived/give@cmd"},
    {name: "a daily claim is a change with no known balance",
        message: fake(`You got your daily 30 :dogegejam:`, reply),
        expected: "111 +30 -> null dailyClaim/daily@cmd"},
    {name: "a yearly claim is filed under its own tier",
        message: fake(`You got your yearly 1920 :dogegejam:`, reply),
        expected: "111 +1920 -> null yearlyClaim/yearly@cmd"},
    {name: "points on yourself is a checkpoint",
        message: fake(`You have 500 points`, reply),
        expected: "111 = 500@cmd"},
    {name: "points on someone else is a checkpoint for them",
        message: fake(`<@222> has 700 points`, reply),
        expected: "222 = 700@cmd"},
    {name: "points on someone by raw id is a checkpoint for that id",
        message: fake(`123456789012345678 has 700 points`, reply),
        expected: "123456789012345678 = 700@cmd"},
    {name: "a rejected wager on a button is a checkpoint for whoever pressed it",
        message: fake(`You only got 5 :noppers:`, {interactionUser: "444"}),
        expected: "444 = 5@bot"},
    {name: "a stats reply is a checkpoint for the user in its title",
        message: fake(`**<@555>'s Stats**\n\`\`\`Ruby\nPoints          12,345\nActive          1 days / 2 hours / 3 minutes\n\`\`\``, reply),
        expected: "555 = 12345@cmd"},
    {name: "a war offer nobody answered is a checkpoint for the challenger",
        message: fake(`<@111> wants a war  with <@222>, theres 750 points on the line <:pepo_shake:1>\nWar will be canceled <t:1:R>`),
        expected: "111 = 750@bot"},
    {name: "a partial bet refund is a change with the balance it left",
        message: fake(`<@111> got 20 points back <:smodge:1> and now has 30 points`),
        expected: "111 +20 -> 30 betPayout/bet@bot"},
    {name: "a winning bet is left for the bet linker, which knows the stake",
        message: fake(`<@111> won 150 points <:nice:1> and now has 650 points`),
        expected: ""},
    {name: "a bet that lost it all is a checkpoint",
        message: fake(`<@111> lost it all and now has 0 points <:smodge:1>`),
        expected: "111 = 0@bot"},
    {name: "a challenge result on its own is not a change",
        message: fake(`<@111> wins 50 points <:nice:1>`),
        expected: ""},
    {name: "a wager the user cannot cover says nothing",
        message: fake(`You ain't got 500. Sit`, reply),
        expected: ""},
    {name: "a you-shaped message with no reference is skipped",
        message: fake(`You have 500 points`),
        expected: ""},

    {name: "a flip panel turns each numbered line into a change from the one before",
        message: fake(alternating),
        expected: "666 = 1000@bot | 666 +100 -> 1100 flip/flip@bot | 666 -100 -> 1000 flip/flip@bot | 666 +100 -> 1100 flip/flip@bot | 666 -100 -> 1000 flip/flip@bot | 666 = 1000@bot"},
    {name: "a flip line whose previous balance scrolled off is only a checkpoint",
        message: fake(scrolledFlips),
        expected: "666 = 1000@bot | 666 = 1300@bot | 666 +100 -> 1400 flip/flip@bot | 666 +100 -> 1500 flip/flip@bot | 666 +100 -> 1600 flip/flip@bot | 666 +100 -> 1700 flip/flip@bot | 666 = 1700@bot"},
    {name: "the attached flip record fills in the lines that scrolled off",
        message: fake(scrolledFlips),
        record: "1) ✅ 1100\n2) ✅ 1200\n3) ✅ 1300\n4) ✅ 1400\n5) ✅ 1500\n6) ✅ 1600\n7) ✅ 1700",
        expected: "666 = 1000@bot | 666 +100 -> 1100 flip/flip@bot | 666 +100 -> 1200 flip/flip@bot | 666 +100 -> 1300 flip/flip@bot | 666 +100 -> 1400 flip/flip@bot | 666 +100 -> 1500 flip/flip@bot | 666 +100 -> 1600 flip/flip@bot | 666 +100 -> 1700 flip/flip@bot | 666 = 1700@bot"},
    {name: "a busted flip-all run on the net panel doubles from its start and loses the lot",
        message: fake(`**<@888>'s Flips**
\`\`\`ansi
Points: 0     Net: ${ESC}[0;31m-300${ESC}[0m     Flip: 3 of 5
W: 2     L: 1

✅ ✅ ❌
\`\`\`
Sit`),
        expected: "888 = 300@bot | 888 +300 -> 600 flip/flip@bot | 888 +600 -> 1200 flip/flip@bot | 888 -1200 -> 0 flip/flip@bot | 888 = 0@bot"},
    {name: "a fixed-bet run on the net panel works its bet out from the net and the record",
        message: fake(`**<@888>'s Flips**
\`\`\`ansi
Points: 50     Net: ${ESC}[0;31m-100${ESC}[0m     Flip: 3 of 5
W: 1     L: 2

✅ ❌ ❌
\`\`\`
You ain't got 100. Sit`),
        expected: "888 = 150@bot | 888 +100 -> 250 flip/flip@bot | 888 -100 -> 150 flip/flip@bot | 888 -100 -> 50 flip/flip@bot | 888 = 50@bot"},
    {name: "a fixed-bet run that broke even cannot show its bet, so only its ends are kept",
        message: fake(`**<@888>'s Flips**
\`\`\`ansi
Points: 1000     Net: 0     Flip: 2 of 2
W: 1     L: 1

✅ ❌
\`\`\`
2 flips, :shruggers:`),
        expected: "888 = 1000@bot | 888 = 1000@bot"},
    {name: "a 2023 flip-all run that made it through is rebuilt from its final balance",
        message: fake(`**<@777>'s Flips**
\`\`\`Ruby
Points: 80     Flips Left: 0

✅ ✅ ✅
\`\`\`
You made it through :peepo_comfy:`),
        expected: "777 +10 -> 20 flip/flip@bot | 777 +20 -> 40 flip/flip@bot | 777 +40 -> 80 flip/flip@bot | 777 = 80@bot"},
    {name: "a 2023 flip-all run that busted only leaves its final balance",
        message: fake(`**<@777>'s Flips**
\`\`\`Ruby
Points: 0     Flips Left: 2

✅ ✅ ❌
\`\`\`
Sit`),
        expected: "777 = 0@bot"},
    {name: "a martingale ladder is walked back from the final balance into changes",
        message: fake(busted),
        expected: "999 = 1000@bot | 999 +100 -> 1100 martingale/martin@bot | 999 -100 -> 1000 martingale/martin@bot | 999 -200 -> 800 martingale/martin@bot | 999 -400 -> 400 martingale/martin@bot | 999 = 400@bot"},
    {name: "a scrolled ladder only yields the rounds it still shows",
        message: fake(scrolledLadder),
        expected: "999 = 1000@bot | 999 -100 -> 1000 martingale/martin@bot | 999 -200 -> 800 martingale/martin@bot | 999 -400 -> 400 martingale/martin@bot | 999 = 400@bot"},
    {name: "the attached ladder record restores the rounds that scrolled off",
        message: fake(scrolledLadder),
        record: "1) ✅ 100\n2) ❌ 100  ❌ 200  ❌ 400",
        expected: "999 = 1000@bot | 999 +100 -> 1100 martingale/martin@bot | 999 -100 -> 1000 martingale/martin@bot | 999 -200 -> 800 martingale/martin@bot | 999 -400 -> 400 martingale/martin@bot | 999 = 400@bot"},

    {name: "a finished war escrows both whole balances and pays the pot to the winner",
        message: fake(`War accepted by <@222> <:pepo_smash:1>\`\`\`   alice | bob
Bet  500 | 300 ⠀
1) W 800 | 0    \`\`\`<@222> got dusted <:smodge:2>
<@111> won 300 points <:nice:3>`),
        expected: "111 -500 -> 0 warEscrow/war@bot | 222 -300 -> 0 warEscrow/war@bot | 111 +800 -> 800 warPayout/war@bot"},
    {name: "a war still being fought records nothing yet",
        message: fake(`War accepted by <@222> <:pepo_smash:1>\`\`\`   alice | bob\nBet  500 | 300 ⠀\`\`\``),
        expected: ""},
    {name: "a rock paper scissors win escrows the accepted bet from both and pays double",
        message: fake(`<@111> against <@222> for 40 points <:pepo_smash:1>\n⠀\n<@111> ✌ vs 👊 <@222>\n<@222> wins 40 points <:nice:2>`),
        expected: "111 -40 -> null rpsEscrow/rps@bot | 222 -40 -> null rpsEscrow/rps@bot | 222 +80 -> null rpsPayout/rps@bot"},
    {name: "a rock paper scissors tie refunds both, so nothing changed",
        message: fake(`<@111> against <@222> for 40 points <:pepo_smash:1>\n⠀\n<@111> 👊 vs 👊 <@222>\nNo one wins :shruggers:`),
        expected: ""},
]

const challengeTests: {name: string, messages: Message<boolean>[], expected: string}[] = [
    {name: "a challenge accepted for less than offered leaves the accepter with nothing",
        messages: [
            fake(`<@111> has challenged <@222> for up to 100 points.`, {id: "offer", at: minutes(0)}),
            fake(`Challenge accepted by <@222> for 60 points <:pepo_smash:1>`, {id: "accept", at: minutes(1)}),
            fake(`<@111> wins 60 points <:nice:1>`, {id: "result", at: new Date(minutes(1).getTime() + 400)}),
        ],
        expected: "111 -60 -> null challengeEscrow/challenge@accept | 222 -60 -> 0 challengeEscrow/challenge@accept | 111 +120 -> null challengePayout/challenge@accept"},
    {name: "an open challenge is paired with whoever accepted it",
        messages: [
            fake(`<@111> has challenged anyone for 60 points.`, {id: "offer", at: minutes(0)}),
            fake(`Challenge accepted by <@333> for 60 points <:pepo_smash:1>`, {id: "accept", at: minutes(2)}),
            fake(`<@333> wins 60 points <:nice:1>`, {id: "result", at: minutes(2)}),
        ],
        expected: "111 -60 -> null challengeEscrow/challenge@accept | 333 -60 -> null challengeEscrow/challenge@accept | 333 +120 -> null challengePayout/challenge@accept"},
    {name: "an accept with no offer before it is left out",
        messages: [
            fake(`Challenge accepted by <@222> for 60 points <:pepo_smash:1>`, {id: "accept", at: minutes(1)}),
            fake(`<@222> wins 60 points <:nice:1>`, {id: "result", at: minutes(1)}),
        ],
        expected: ""},
    {name: "an offer from too long ago is not paired",
        messages: [
            fake(`<@111> has challenged anyone for 60 points.`, {id: "offer", at: minutes(0)}),
            fake(`Challenge accepted by <@222> for 60 points <:pepo_smash:1>`, {id: "accept", at: minutes(10)}),
            fake(`<@222> wins 60 points <:nice:1>`, {id: "result", at: minutes(10)}),
        ],
        expected: ""},
]

const outcome = (label: string, stakes: [string, number][], options: IFakeOptions) =>
    fake(`⠀  \`${label}            1 : 2.00\`\n${stakes.map(stake => `⠀       __<@${stake[0]}>: ${stake[1]}__\n`).join("")}⠀`, options)

const betTests: {name: string, messages: Message<boolean>[], expected: string}[] = [
    {name: "a settled bet escrows every stake and pays winners their stake plus the profit",
        messages: [
            outcome("1) Yes", [["111", 50], ["222", 30]], {id: "outcome1", thread: "t1", editedAt: minutes(5)}),
            outcome("2) No", [["333", 80]], {id: "outcome2", thread: "t1", editedAt: minutes(6)}),
            fake(`<@333> won 80 points :nice: and now has 400 points`, {id: "pay", thread: "t1", at: minutes(30)}),
            fake(`<@111> lost it all and now has 20 points :smodge:`, {id: "lost", thread: "t1", at: minutes(30)}),
        ],
        expected: "111 -50 -> null betEscrow/bet@outcome1 | 222 -30 -> null betEscrow/bet@outcome1 | 333 -80 -> null betEscrow/bet@outcome2 | 333 +160 -> 400 betPayout/bet@pay"},
    {name: "a bet that never paid out records nothing",
        messages: [outcome("1) Yes", [["111", 50]], {id: "outcome1", thread: "t1"})],
        expected: ""},
    {name: "a win whose stake cannot be seen is only a checkpoint",
        messages: [fake(`<@333> won 80 points :nice: and now has 400 points`, {id: "pay", thread: "t2"})],
        expected: "333 = 400@pay"},
    {name: "one thread's payouts never settle another thread's stakes",
        messages: [
            outcome("1) Yes", [["111", 50]], {id: "outcome1", thread: "t1"}),
            fake(`<@111> won 50 points :nice: and now has 400 points`, {id: "pay", thread: "t2"}),
        ],
        expected: "111 = 400@pay"},
]

const main = async () => {
    for (const test of tests) {
        check(test.name, summarize(observe(test.message, test.record)), test.expected)
    }

    for (const test of challengeTests) {
        const facts = test.messages
            .map(message => challengeFact(message))
            .filter((fact): fact is IChallengeFact => fact !== undefined)
        check(test.name, summarize(linkChallenges(facts)), test.expected)
    }

    for (const test of betTests) {
        const facts = test.messages.reduce((all: IBetFact[], message) => all.concat(betFacts(message)), [])
        check(test.name, summarize(linkBets(facts)), test.expected)
    }

    const offsets = (observations: Observation[]): string =>
        observations.map(observation => observation.at.getTime() - AT.getTime()).join(",")

    check("a single flip is timed to when it was flipped, before its reply",
        offsets(observe(fake(`You won 50 points :nice: You've got 1234 points now.`, reply))), "-3200")
    check("a run's flips are spread evenly between the panel being posted and its last edit",
        offsets(observe(fake(alternating, {editedAt: new Date(AT.getTime() + 12000)}))), "0,3000,6000,9000,12000,12000")

    console.log(`\n${passes} passed, ${failures} failed`)
    process.exit(failures > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
