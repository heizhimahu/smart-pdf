"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// 声明全局 pdf.js 类型
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface PDFCanvasProps {
  pdfUrl: string;
  onSelectionChange?: (selection: SelectionBox | null) => void;
}

export default function PDFCanvas({ pdfUrl, onSelectionChange }: PDFCanvasProps) {
  console.log("[PDFCanvas] 组件渲染, pdfUrl:", pdfUrl ? "存在" : "不存在");
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale] = useState(1.5);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isReady, setIsReady] = useState(false);
  const [pdfjsLoaded, setPdfjsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 选区状态
  const [isDrawing, setIsDrawing] = useState(false);
  const [selection, setSelection] = useState<SelectionBox | null>(null);
  const drawStartRef = useRef({ x: 0, y: 0 });

  // 加载 pdf.js CDN
  useEffect(() => {
    console.log("[PDFCanvas] useEffect - 加载 pdf.js");
    if (window.pdfjsLib) {
      setPdfjsLoaded(true);
      console.log("[PDFCanvas] pdf.js 已存在");
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      setPdfjsLoaded(true);
      console.log("[PDFCanvas] pdf.js CDN 加载成功");
    };
    script.onerror = () => {
      setError("pdf.js 加载失败");
      console.error("[PDFCanvas] pdf.js CDN 加载失败");
    };
    document.head.appendChild(script);
  }, []);

  // 加载 PDF
  useEffect(() => {
    console.log("[PDFCanvas] useEffect - 加载 PDF, pdfjsLoaded:", pdfjsLoaded, "pdfUrl:", pdfUrl ? "存在" : "不存在");
    if (!pdfjsLoaded || !pdfUrl) return;

    const loadPdf = async () => {
      try {
        console.log("[PDFCanvas] 开始加载 PDF:", pdfUrl);
        const loadingTask = window.pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        console.log("[PDFCanvas] PDF 加载成功，共", pdf.numPages, "页");
      } catch (err) {
        setError("PDF 加载失败: " + String(err));
        console.error("[PDFCanvas] PDF 加载失败:", err);
      }
    };

    loadPdf();
  }, [pdfUrl, pdfjsLoaded]);

  // 渲染当前页
  useEffect(() => {
    console.log("[PDFCanvas] useEffect - 渲染页面, pdfDoc:", pdfDoc ? "存在" : "不存在");
    if (!pdfDoc || !canvasRef.current || !selectionCanvasRef.current) return;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current!;
        const selectionCanvas = selectionCanvasRef.current!;
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        selectionCanvas.height = viewport.height;
        selectionCanvas.width = viewport.width;
        setCanvasSize({ width: viewport.width, height: viewport.height });

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;
        
        setIsReady(true);
        console.log("[PDFCanvas] PDF 页面渲染完成:", viewport.width, "x", viewport.height);
      } catch (err) {
        setError("渲染失败: " + String(err));
        console.error("[PDFCanvas] 渲染页面失败:", err);
      }
    };

    renderPage();
    setSelection(null);
    setIsReady(false);
    onSelectionChange?.(null);
  }, [currentPage, pdfDoc, scale, onSelectionChange]);

  // 绘制选区
  const drawSelectionRect = useCallback((sel: SelectionBox | null) => {
    const canvas = selectionCanvasRef.current;
    if (!canvas) {
      console.log("[PDFCanvas] drawSelectionRect: canvas 为 null");
      return;
    }
    
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.log("[PDFCanvas] drawSelectionRect: ctx 为 null");
      return;
    }

    console.log(`[PDFCanvas] drawSelectionRect: 清除画布 ${canvas.width}x${canvas.height}, sel:`, sel);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (sel) {
      const width = sel.endX - sel.startX;
      const height = sel.endY - sel.startY;
      
      console.log(`[PDFCanvas] 绘制选区: (${sel.startX}, ${sel.startY}) ${width}x${height}`);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(sel.startX, sel.startY, width, height);
      
      ctx.fillStyle = "rgba(239, 68, 68, 0.3)";
      ctx.fillRect(sel.startX, sel.startY, width, height);
    }
  }, []);

  // 鼠标事件处理
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const canvas = selectionCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    console.log("[PDFCanvas] 鼠标按下:", x, y);
    setIsDrawing(true);
    drawStartRef.current = { x, y };
    setSelection({ startX: x, startY: y, endX: x, endY: y });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = selectionCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newSelection = {
      startX: drawStartRef.current.x,
      startY: drawStartRef.current.y,
      endX: x,
      endY: y,
    };

    setSelection(newSelection);
    drawSelectionRect(newSelection);
  }, [isDrawing, drawSelectionRect]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !selection) {
      setIsDrawing(false);
      return;
    }
    
    setIsDrawing(false);
    
    const normalizedSelection: SelectionBox = {
      startX: Math.min(selection.startX, selection.endX),
      startY: Math.min(selection.startY, selection.endY),
      endX: Math.max(selection.startX, selection.endX),
      endY: Math.max(selection.startY, selection.endY),
    };
    
    // 检查选区尺寸是否太小（小于5像素）
    const width = normalizedSelection.endX - normalizedSelection.startX;
    const height = normalizedSelection.endY - normalizedSelection.startY;
    const MIN_SELECTION_SIZE = 5;
    
    if (width < MIN_SELECTION_SIZE || height < MIN_SELECTION_SIZE) {
      console.log("[PDFCanvas] 选区太小，忽略:", normalizedSelection, `尺寸: ${width}x${height}`);
      setSelection(null);
      drawSelectionRect(null);
      onSelectionChange?.(null);
      return;
    }
    
    console.log("[PDFCanvas] 选区完成:", normalizedSelection, `尺寸: ${width}x${height}`);
    setSelection(normalizedSelection);
    onSelectionChange?.(normalizedSelection);
    drawSelectionRect(normalizedSelection);
  }, [isDrawing, selection, onSelectionChange, drawSelectionRect]);

  // 清除选区
  const clearSelection = useCallback(() => {
    console.log("[PDFCanvas] 清除选区按钮被点击");
    setSelection(null);
    drawSelectionRect(null);
    onSelectionChange?.(null);
    console.log("[PDFCanvas] 选区已清除");
  }, [drawSelectionRect, onSelectionChange]);

  // 导出当前页为 Base64
  const exportToBase64 = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    // 获取 data URL (格式: data:image/png;base64,...)
    const dataUrl = canvas.toDataURL("image/png");
    
    // 提取纯 Base64 部分（移除 data:image/png;base64, 前缀）
    const base64Prefix = "data:image/png;base64,";
    if (dataUrl.startsWith(base64Prefix)) {
      return dataUrl.substring(base64Prefix.length);
    }
    
    // 如果格式不对，尝试其他方式
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex !== -1) {
      return dataUrl.substring(commaIndex + 1);
    }
    
    console.error("[PDFCanvas] 无法提取 Base64 数据，返回完整 data URL");
    return dataUrl;
  }, []);

  // 用处理后的图像更新 Canvas，返回 Promise 确保图像加载完成
  const updateWithProcessedImage = useCallback((processedImageBase64: string, selection: SelectionBox): Promise<boolean> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        console.error("[PDFCanvas] updateWithProcessedImage: canvas 为 null");
        resolve(false);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        console.error("[PDFCanvas] updateWithProcessedImage: ctx 为 null");
        resolve(false);
        return;
      }

      console.log("[PDFCanvas] 更新 Canvas 使用处理后的图像");

      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        console.log(`[PDFCanvas] 图像已更新: ${img.width}x${img.height}`);
        clearSelection();
        resolve(true);
      };

      img.onerror = (err) => {
        console.error("[PDFCanvas] 加载处理后的图像失败:", err);
        resolve(false);
      };

      img.src = `data:image/png;base64,${processedImageBase64}`;
    });
  }, [clearSelection]);

  // 暴露方法给父组件（包括页码和尺寸信息）
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).pdfCanvasExport = { 
        exportToBase64, 
        clearSelection,
        updateWithProcessedImage,
        getCurrentPage: () => currentPage,
        getTotalPages: () => totalPages,
        getCanvasSize: () => canvasSize,
        getPageSizePts: () => {
          // 返回原始 PDF 页面尺寸（单位：pt）
          return { width: canvasSize.width / scale, height: canvasSize.height / scale };
        }
      };
    }
  }, [exportToBase64, clearSelection, updateWithProcessedImage, currentPage, totalPages, canvasSize, scale]);

  // 如果没有 pdfUrl，显示提示
  if (!pdfUrl) {
    return <div className="p-4 bg-gray-100 rounded">等待 PDF URL...</div>;
  }

  return (
    <div className="flex flex-col items-center p-4 border-4 border-blue-500 bg-gray-50">
      {/* 调试信息 */}
      <div className="mb-4 p-3 bg-yellow-200 rounded-lg text-sm font-bold text-gray-900">
        <div className="font-bold">🔍 PDFCanvas 组件已渲染</div>
        <div>pdf.js: {pdfjsLoaded ? "✅ 已加载" : "⏳ 加载中..."}</div>
        <div>PDF: {pdfDoc ? `✅ ${totalPages} 页` : "⏳ 等待中..."}</div>
        <div>Canvas: {canvasSize.width} x {canvasSize.height}</div>
        <div>选区: {selection ? `✅ (${selection.startX}, ${selection.startY}) → (${selection.endX}, ${selection.endY})` : "❌ 无"}</div>
        {error && <div className="text-red-600">错误: {error}</div>}
      </div>

      {/* 页面控制 */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded disabled:bg-zinc-300 disabled:text-zinc-100 disabled:cursor-not-allowed transition-colors"
        >
          上一页
        </button>
        <span className="text-zinc-700 font-medium">{currentPage} / {totalPages || 1}</span>
        <button
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage >= totalPages}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded disabled:bg-zinc-300 disabled:text-zinc-100 disabled:cursor-not-allowed transition-colors"
        >
          下一页
        </button>
        <button
          onClick={clearSelection}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded transition-colors"
        >
          清除选区
        </button>
      </div>

      {/* PDF 画布容器 */}
      <div 
        style={{ 
          position: "relative",
          border: "3px solid red",
          borderRadius: "8px",
          overflow: "hidden",
          display: "inline-block"
        }}
      >
        <canvas 
          ref={canvasRef} 
          style={{ display: "block", background: "#f5f5f5" }} 
        />
        <canvas
          ref={selectionCanvasRef}
          style={{ 
            position: "absolute",
            top: 0,
            left: 0,
            cursor: "crosshair",
            background: "transparent"
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
      
      <div className="mt-4 text-sm text-zinc-700 bg-yellow-100 p-3 rounded-lg">
        <div className="font-bold mb-1">💡 使用说明：</div>
        <div>1. 按住鼠标左键<strong>拖拽</strong>绘制选区（不要只是点击）</div>
        <div>2. 选区最小尺寸：5x5 像素</div>
        <div>3. 绘制完成后点击"清除手写"按钮</div>
      </div>
    </div>
  );
}