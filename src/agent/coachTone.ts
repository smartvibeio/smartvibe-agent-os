/** Presentation-only cleanup for older replies. Original records remain unchanged. */
export function friendlyCoachText(text: string) {
  return text
    .replace(/[，,；;]?这些尚未经真实账户记录验证[。.]?/g, "。我们可以在后续练习中一起了解触发这些反应的情境。")
    .replace(/[，,；;]?但不能认定实盘已发生[。.]?/g, "。我们先从你描述的经历聊起。")
    .replace(/分身数值仅作初始提示[，,]不是行为证明[。.]?/g, "分身会随着你的反馈与练习逐步完善。")
    .replace(/[，,；;]?本次不据此判断胜率提高[。.]?/g, "")
    .replace(/你自述的/g, "你提到的")
    .replace(/。{2,}/g, "。");
}
