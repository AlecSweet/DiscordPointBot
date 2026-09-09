// Discord renders <t:unix:R> as a relative time that ticks in each viewer's own
// client, so a single edit covers an entire countdown instead of one edit per
// visible second. Timestamps are not parsed inside a code block, so this has to
// be placed outside the fence.
const countdownTo = (deadline: number): string => {
    return `<t:${Math.round(deadline / 1000)}:R>`
}

export default countdownTo
