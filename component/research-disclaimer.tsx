/**
 * 文献调研结果末尾的"使用须知"卡片。
 * 提醒用户本 agent 的局限，并指引用人工流程补齐。
 * 在任何 paper_search 出结果的 assistant 消息末尾自动展示。
 */
export default function ResearchDisclaimer() {
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <span aria-hidden>⚠️</span>
        <span>调研须知：本 agent 的能力边界</span>
      </div>

      <p className="mb-2 leading-relaxed">
        以上结果<strong>仅基于 arXiv 预印本</strong>，请<strong>不要完全依赖本
        agent</strong> 替代严肃的文献调研。它适合"快速摸底"，<strong
        >不适合"系统性综述"</strong
        >。
      </p>

      <details className="group" open>
        <summary className="cursor-pointer select-none text-xs font-medium text-amber-800 hover:underline">
          已知局限（点击折叠）
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
          <li>
            只覆盖 arXiv，<strong>期刊论文、IEEE/ACM/Springer 闭源出版社论文搜不到</strong>
          </li>
          <li>
            不支持"按 CVPR/NeurIPS 等顶会精确过滤"
          </li>
          <li>
            不支持"引用网络"（看一篇论文引用了谁/被谁引用）
          </li>
          <li>
            只能看摘要，<strong>看不了 PDF 全文</strong>
          </li>
        </ul>
      </details>

      <details className="group mt-3">
        <summary className="cursor-pointer select-none text-xs font-medium text-amber-800 hover:underline">
          ✅ 推荐的人工补全流程（点击展开）
        </summary>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-xs leading-relaxed">
          <li>
            <strong>顶会精确过滤</strong>：去会议官网按年浏览 + 浏览器 Ctrl+F 搜关键词
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>
                CVPR / ICCV / ECCV / WACV →{' '}
                <a
                  href="https://openaccess.thecvf.com/menu"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 underline"
                >
                  openaccess.thecvf.com
                </a>
              </li>
              <li>
                NeurIPS / ICML / ICLR →{' '}
                <a
                  href="https://openreview.net/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 underline"
                >
                  openreview.net
                </a>{' '}
                （能看到评分和 reviewer 意见）
              </li>
              <li>
                ACL / EMNLP / NAACL →{' '}
                <a
                  href="https://aclanthology.org/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 underline"
                >
                  aclanthology.org
                </a>
              </li>
            </ul>
          </li>

          <li>
            <strong>引用网络</strong>：把上面感兴趣的论文标题/arXiv id 输入
            <a
              href="https://www.connectedpapers.com/"
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-blue-700 underline"
            >
              Connected Papers
            </a>
            （国内可直连、无需账号），可视化引用图谱；或直接打开
            <a
              href="https://www.semanticscholar.org/"
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-blue-700 underline"
            >
              Semantic Scholar
            </a>{' '}
            网页版看 References / Cited by
          </li>

          <li>
            <strong>全网召回</strong>：用
            <a
              href="https://scholar.google.com/"
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-blue-700 underline"
            >
              Google Scholar
            </a>
            （需梯子）或国内的
            <a
              href="https://www.aminer.cn/"
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-blue-700 underline"
            >
              AMiner
            </a>{' '}
            补期刊论文与跨学科文献，按"Since 20xx"过滤近期
          </li>

          <li>
            <strong>论文深读</strong>：下载 PDF 后丢给支持读 PDF 的 AI 工具（如
            ChatGPT 网页版、Claude、NotebookLM）做精读总结
          </li>

          <li>
            <strong>找配套代码</strong>：可继续问本 agent "搜 GitHub 上
            xxx-papers / awesome-xxx-papers 仓库"
          </li>
        </ol>
      </details>

      <p className="mt-3 text-xs text-amber-700">
        简言之：<strong>本 agent ≈ 第一步快速摸底</strong>；真正的综述工作需要
        上面这四步人工配合。
      </p>
    </div>
  );
}
