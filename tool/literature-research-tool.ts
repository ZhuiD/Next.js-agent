import { tool, type UIToolInvocation, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import { createResearchAgent } from '@/agent/research-agent';

/**
 * 把 Literature Research subagent 包装成给主 agent 使用的 tool。
 *
 * 关键：通过 experimental_context 拿到 main writer，把 subagent 的
 * UI message stream merge 进去，这样 subagent 内部调 paper_search 产生
 * 的卡片、它的中文报告文本，都会直接 stream 到前端，跟主 agent 的输出
 * 共用同一个 assistant 气泡。
 */
export const literatureResearchTool = tool({
  description:
    '把文献调研任务交给"文献调研 subagent"完成。subagent 会自己做关键词扩展、' +
    '调 arXiv 检索、整理出结构化中文报告。当用户问论文、文献综述、某研究方向最新进展、' +
    '顶会论文时调用此工具。subagent 会把完整报告直接 stream 给用户，你只需做简短承上启下。',
  inputSchema: z.object({
    task: z
      .string()
      .min(2)
      .describe(
        '用户的原始诉求（中文转述即可）。例如："视频生成扩散模型最近半年的进展"。' +
          '不需要你自己翻译/扩关键词——subagent 会做。',
      ),
  }),
  async *execute({ task }, { experimental_context }) {
    yield { state: 'loading' as const, task };

    const ctx = experimental_context as
      | { writer?: UIMessageStreamWriter }
      | undefined;
    const writer = ctx?.writer;

    if (!writer) {
      // 没拿到 writer 时退化为"非流式"模式：不转发 UI，只把结果回给 parent。
      // 实际运行不应走到这里——route handler 会注入 writer。
      yield {
        state: 'error' as const,
        message: 'literature_research: missing UI stream writer in context',
      };
      return;
    }

    try {
      const subagent = createResearchAgent();
      const result = await subagent.stream({ prompt: task });

      // 1) 把 subagent 的整条 UI stream 转发到主流——
      //    用户会看到 subagent 的文本 + paper_search 卡片实时流出。
      //    不发 sendStart/sendFinish，因为这是主消息内的嵌套段落。
      writer.merge(
        result.toUIMessageStream({
          sendStart: false,
          sendFinish: false,
        }),
      );

      // 2) 等 subagent 完整跑完，把最终文本作为 tool 输出回给主 agent，
      //    这样主 agent 知道任务完成了、subagent 说了什么，可以做简短收尾。
      const finalText = await result.text;

      yield {
        state: 'ready' as const,
        task,
        // 注：报告已 stream 给用户，这里只回 parent LLM 做上下文；
        // 故主 agent prompt 要求"不要重复 subagent 内容"。
        report: finalText,
      };
    } catch (err) {
      yield {
        state: 'error' as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export type LiteratureResearchUIToolInvocation = UIToolInvocation<
  typeof literatureResearchTool
>;
