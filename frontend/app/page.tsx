"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import PDFCanvas from "./components/PDFCanvas";

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionBox | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============ Day 5: 会话管理 ============
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [editedPages, setEditedPages] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  console.log("[Home] 渲染中, pdfUrl:", pdfUrl, "sessionId:", sessionId, "editedPages:", [...editedPages]);

  // 处理文件选择（支持 .docx 和 .pdf）
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const name = selectedFile.name.toLowerCase();
      if (!name.endsWith(".docx") && !name.endsWith(".pdf")) {
        setError("请上传 .docx 或 .pdf 格式的文件");
        return;
      }
      setFile(selectedFile);
      setError(null);
      setPdfUrl(null);
      setSessionId(null);
      setEditedPages(new Set());
    }
  };

  // 初始化编辑会话
  const initSession = async () => {
    try {
      const res = await fetch("http://localhost:8002/init-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("初始化会话失败");
      const data = await res.json();
      if (data.success) {
        setSessionId(data.session_id);
        console.log("[Home] 会话初始化成功:", data.session_id);
      }
    } catch (err) {
      console.error("[Home] 初始化会话失败:", err);
    }
  };

  // 每当获取到总页数时，自动初始化会话
  useEffect(() => {
    if (totalPages > 0 && !sessionId) {
      initSession();
    }
  }, [totalPages, sessionId]);

  // 转换 Word 为 PDF
  const handleConvert = async () => {
    if (!file) {
      setError("请先选择文件");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("http://localhost:8002/convert", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("转换失败");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      console.log("[Home] PDF URL 创建:", url);
      setPdfUrl(url);
      setEditedPages(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "转换出错");
    } finally {
      setLoading(false);
    }
  };

  // 选区变化回调
  const handleSelectionChange = useCallback((sel: SelectionBox | null) => {
    console.log("[Home] handleSelectionChange 被调用:", sel);
    setSelection(sel);
    console.log("[Home] 选区变化:", sel);
  }, []);

  // 当 PDFCanvas 信息更新时，同步总页数
  useEffect(() => {
    const intervalId = setInterval(() => {
      const pdfExport = (window as any).pdfCanvasExport;
      if (pdfExport?.getTotalPages) {
        const pages = pdfExport.getTotalPages();
        if (pages > 0 && pages !== totalPages) {
          setTotalPages(pages);
          console.log("[Home] 同步总页数:", pages);
        }
      }
    }, 1000);
    return () => clearInterval(intervalId);
  }, [totalPages]);

  // ============ Day 5: 保存页面图像到后端 ============
  const savePageImage = async (pageNum: number, imageBase64: string, w: number, h: number, pageWidthPts?: number, pageHeightPts?: number) => {
    let sid = sessionId;

    // 如果会话未初始化，先初始化
    if (!sid) {
      try {
        const initRes = await fetch("http://localhost:8002/init-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const initData = await initRes.json();
        if (initData.success) {
          sid = initData.session_id;
          setSessionId(sid);
        } else {
          throw new Error("初始化会话失败");
        }
      } catch (err) {
        console.error("[Home] 初始化会话失败:", err);
        return false;
      }
    }

    setIsSaving(true);
    try {
      // 检查 base64 大小
      console.log(`[Home] 保存页面: 第${pageNum}页, 图片base64长度=${imageBase64.length}, 尺寸=${w}x${h}`);

      // 构建请求体，含原始 PDF 页面尺寸
      const saveBody: any = {
        session_id: sid,
        page: pageNum,
        image_base64: imageBase64,
        width: w,
        height: h,
      };
      if (pageWidthPts && pageHeightPts) {
        saveBody.page_width_pts = pageWidthPts;
        saveBody.page_height_pts = pageHeightPts;
        console.log(`[Home] 附加上下文页面尺寸: ${pageWidthPts}x${pageHeightPts}pts`);
      }

      const res = await fetch("http://localhost:8002/save-page-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveBody),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "无法读取响应体");
        console.error(`[Home] 保存失败: HTTP ${res.status}, 响应: ${errorText.substring(0, 500)}`);
        throw new Error(`保存页面图像失败 (HTTP ${res.status})`);
      }

      const data = await res.json();
      console.log(`[Home] 保存响应:`, data);
      if (data.success) {
        console.log(`[Home] 第 ${pageNum} 页图像已保存到后端`);
        setEditedPages((prev) => new Set(prev).add(pageNum));
        return true;
      }
      return false;
    } catch (err) {
      console.error("[Home] 保存页面图像失败:", err);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // 清除手写
  const handleRemoveHandwriting = async () => {
    if (!selection) {
      setError("请先框选要清除的区域");
      return;
    }

    // 检查选区尺寸是否有效
    const width = Math.abs(selection.endX - selection.startX);
    const height = Math.abs(selection.endY - selection.startY);
    const MIN_SELECTION_SIZE = 5;
    
    if (width < MIN_SELECTION_SIZE || height < MIN_SELECTION_SIZE) {
      setError(`选区太小 (${width.toFixed(0)}x${height.toFixed(0)} 像素)，请拖拽绘制更大的区域`);
      return;
    }

    const pdfExport = (window as any).pdfCanvasExport;
    if (!pdfExport?.exportToBase64) {
      setError("PDF 未加载完成");
      return;
    }

    // 获取当前页码
    const currentPage = pdfExport.getCurrentPage ? pdfExport.getCurrentPage() : 1;

    const imageBase64 = pdfExport.exportToBase64();
    if (!imageBase64) {
      setError("导出图片失败");
      return;
    }

    console.log("[Home] 发送请求, Base64 长度:", imageBase64.length, "页码:", currentPage);

    try {
      const res = await fetch("http://localhost:8002/remove-handwriting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: imageBase64,
          startX: selection.startX,
          startY: selection.startY,
          endX: selection.endX,
          endY: selection.endY,
          page: currentPage,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(`请求失败: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`);
      }

      const data = await res.json();
      console.log("[Home] 后端响应:", data);
      
      if (data.success) {
        if (data.processed_image) {
          // 获取 canvas 尺寸
          const canvasSize = pdfExport.getCanvasSize ? pdfExport.getCanvasSize() : { width: 0, height: 0 };

          // 1. 先更新 Canvas 显示（等待图片加载完成）
          const updateFunc = pdfExport.updateWithProcessedImage;
          let updateOk = false;
          if (updateFunc && typeof updateFunc === 'function') {
            updateOk = await updateFunc(data.processed_image, selection);
          }

          if (!updateOk) {
            console.error("[Home] Canvas 更新失败");
          }

          // 获取原始 PDF 页面尺寸（pt）
          let pagePts = { width: 0, height: 0 };
          if (pdfExport.getPageSizePts) {
            pagePts = pdfExport.getPageSizePts();
          }

          // 2. Canvas 更新完成后，再自动保存到后端（含原始PDF页面尺寸）
          const saved = await savePageImage(
            currentPage,
            data.processed_image,
            Math.round(canvasSize.width || 0),
            Math.round(canvasSize.height || 0),
            pagePts.width,
            pagePts.height
          );

          if (saved) {
            setError(null);
            alert(`✅ 手写已清除！\n\n第 ${currentPage} 页修改已自动保存。\n点击「下载编辑后 PDF」即可下载完整文档。`);
          } else {
            setError(null);
            alert(`✅ 手写已清除！\n\n但页面保存到后端失败，请检查后端是否运行正常。`);
          }
        } else {
          alert(`✅ ${data.message}`);
        }
      } else {
        setError(data.message || "处理失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    }
  };

  // ============ Day 5: 下载编辑后的 PDF ============
  const handleDownloadPDF = async () => {
    let sid = sessionId;

    // 检查是否有编辑过的页面
    if (editedPages.size === 0) {
      // 没有编辑：直接下载原始 PDF
      if (!pdfUrl) {
        setError("没有可下载的 PDF");
        return;
      }
      const link = document.createElement("a");
      link.href = pdfUrl;
      // 根据文件类型决定下载名
      let downloadName: string;
      if (file) {
        if (file.name.endsWith(".pdf")) {
          downloadName = file.name; // PDF 直接使用原名
        } else {
          downloadName = file.name.replace(".docx", ".pdf"); // docx 替换扩展名
        }
      } else {
        downloadName = "document.pdf";
      }
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log("[Home] 下载原始 PDF:", downloadName);
      return;
    }

    // 有编辑：通过后端生成合并的 PDF
    setDownloading(true);
    setError(null);

    try {
      // 如果会话不存在，先创建
      if (!sid) {
        const initRes = await fetch("http://localhost:8002/init-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const initData = await initRes.json();
        if (!initData.success) throw new Error("初始化会话失败");
        sid = initData.session_id;
        setSessionId(sid);
      }

      // 计算总页数
      const pdfExport = (window as any).pdfCanvasExport;
      const pages = pdfExport?.getTotalPages ? pdfExport.getTotalPages() : totalPages;

      if (pages === 0) {
        throw new Error("无法获取总页数");
      }

      // 获取原始 PDF 的 base64（用于保留未编辑的页面）
      let originalPdfBase64 = null;
      if (pdfUrl) {
        try {
          const pdfResp = await fetch(pdfUrl);
          const pdfBlob = await pdfResp.blob();
          const pdfArrayBuf = await pdfBlob.arrayBuffer();
          const pdfBytes = new Uint8Array(pdfArrayBuf);
          // 将二进制转换为 base64
          let binary = '';
          for (let i = 0; i < pdfBytes.length; i++) {
            binary += String.fromCharCode(pdfBytes[i]);
          }
          originalPdfBase64 = btoa(binary);
          console.log(`[Home] 原始 PDF base64 获取成功: ${originalPdfBase64.length} 字符`);
        } catch (e) {
          console.warn("[Home] 获取原始 PDF base64 失败，未编辑页将跳过:", e);
        }
      }

      console.log(`[Home] 请求下载编辑后 PDF: 会话 ${sid}, 共 ${pages} 页, 已编辑 ${[...editedPages]}, 有原始PDF=${!!originalPdfBase64}`);

      const res = await fetch("http://localhost:8002/download-edited-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          total_pages: pages,
          original_pdf_base64: originalPdfBase64,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(`下载失败: ${res.status} - ${JSON.stringify(errorData)}`);
      }

      // 获取 PDF 数据
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // 下载文件
      const link = document.createElement("a");
      link.href = url;
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
          let baseName = "smartpdf";
          if (file) {
            baseName = file.name.replace(/\.(docx|pdf)$/i, ""); // 去掉扩展名
          }
          link.download = `${baseName}_编辑后_${timestamp}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 释放 URL
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      console.log("[Home] 编辑后 PDF 下载完成");
      alert(`✅ 下载成功！\n\n已编辑 ${editedPages.size} 页，共 ${pages} 页。`);

    } catch (err) {
      setError(err instanceof Error ? err.message : "下载失败");
      console.error("[Home] 下载编辑后 PDF 失败:", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-black dark:to-zinc-900">
      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* 标题 */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-white mb-4">
            SmartPDF - 智能文档局部擦除工具
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            上传 PDF / Word · 框选擦除区域 · 一键下载
          </p>
        </div>

        {/* 上传区域 */}
        <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-lg p-8 mb-8">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-zinc-300 dark:border-zinc-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="text-5xl mb-4">📄</div>
            <p className="text-zinc-600 dark:text-zinc-300 mb-2">
              {file ? file.name : "点击上传文件"}
            </p>
            <p className="text-sm text-zinc-400">支持 Word 和 PDF 文件</p>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-center">
              {error}
            </div>
          )}

          <button
            onClick={handleConvert}
            disabled={!file || loading}
            className={`mt-6 w-full py-3 rounded-lg font-medium transition-colors ${
              !file || loading
                ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {loading ? "处理中..." : file?.name?.endsWith(".pdf") ? "📄 加载 PDF" : "🔄 转换为 PDF"}
          </button>
        </div>

        {/* PDF 预览 */}
        {pdfUrl && (
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-4">
              PDF 预览（框选要清除的区域）
            </h2>

            {/* 调试信息 */}
            <div className="mb-2 p-2 bg-green-100 text-green-800 rounded text-sm">
              ✅ PDFCanvas 渲染中，{sessionId ? `会话: ${sessionId}` : "等待会话..."} |
              编辑页: {editedPages.size > 0 ? [...editedPages].join(", ") : "无"} |
              总页数: {totalPages}
            </div>
            
            <PDFCanvas
              pdfUrl={pdfUrl}
              onSelectionChange={handleSelectionChange}
            />

            <div className="mt-6 flex flex-wrap gap-4 items-center">
              <button
                onClick={handleRemoveHandwriting}
                disabled={!selection || isSaving}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  !selection || isSaving
                    ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
                    : "bg-purple-600 text-white hover:bg-purple-700"
                }`}
              >
                {isSaving ? "⏳ 保存中..." : "🪄 清除手写"}
              </button>
              
              <button
                onClick={handleDownloadPDF}
                disabled={downloading}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  downloading
                    ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
                    : editedPages.size > 0
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {downloading
                  ? "⏳ 生成中..."
                  : editedPages.size > 0
                    ? `⬇️ 下载编辑后 PDF (${editedPages.size} 页已修改)`
                    : "⬇️ 下载原始 PDF"}
              </button>
              
              {/* Day 5: 显示编辑状态 */}
              {editedPages.size > 0 && (
                <span className="text-sm text-green-600 font-medium">
                  ✅ 已编辑 {editedPages.size} 页
                </span>
              )}

              {selection && (
                <span className="text-sm text-zinc-500 self-center">
                  选区: ({selection.startX.toFixed(0)}, {selection.startY.toFixed(0)}) → ({selection.endX.toFixed(0)}, {selection.endY.toFixed(0)})
                </span>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
