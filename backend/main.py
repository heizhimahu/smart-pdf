from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
import subprocess
import tempfile
from urllib.parse import quote
import io
import os
import base64
import logging
from typing import Optional, Dict
from PIL import Image
import numpy as np
import cv2
import uuid
from datetime import datetime, timedelta

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="SmartPDF API")

# LibreOffice 路径（如安装路径不同，请修改此处）
LIBREOFFICE_PATH = os.getenv("LIBREOFFICE_PATH", r"C:\Program Files\LibreOffice\program\soffice.exe")

# ============ 会话存储：保存编辑过的页面图像 ============
# 结构: {session_id: {page_number: base64_image}}
editing_sessions: Dict[str, Dict[int, str]] = {}
# 存储 PDF 页面尺寸：{session_id: {page: (width, height)}}
page_sizes: Dict[str, Dict[int, tuple]] = {}
# 存储会话创建时间（用于自动清理）
session_creation_time: Dict[str, datetime] = {}
# 存储原始 PDF 页面尺寸（点）：{session_id: {page: (width_pts, height_pts)}}
page_pts_sizes: Dict[str, Dict[int, tuple]] = {}
SESSION_EXPIRE_MINUTES = 30  # 会话过期时间（分钟）

# 配置 CORS 跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 请求模型：AI 去手写
class RemoveHandwritingRequest(BaseModel):
    image_base64: str  # Base64 编码的图片
    startX: float
    startY: float
    endX: float
    endY: float
    page: int = 1  # 当前页码


# 响应模型
class RemoveHandwritingResponse(BaseModel):
    success: bool
    message: str
    processed_image: Optional[str] = None  # 处理后的 Base64 图片
    selection: Optional[dict] = None
    is_simulated: bool = False


# ============ 新增：保存页面图像请求模型 ============
class SavePageImageRequest(BaseModel):
    session_id: str
    page: int
    image_base64: str
    width: float       # 图像像素宽度
    height: float      # 图像像素高度
    page_width_pts: Optional[float] = None   # 原始 PDF 页面宽度（点）
    page_height_pts: Optional[float] = None  # 原始 PDF 页面高度（点）


class SavePageImageResponse(BaseModel):
    success: bool
    message: str
    session_id: str


# ============ 初始化会话响应模型 ============
class InitSessionResponse(BaseModel):
    success: bool
    session_id: str
    message: str


# ============ 新增：下载编辑后 PDF 请求模型 ============
class DownloadEditedPdfRequest(BaseModel):
    session_id: str
    total_pages: int
    original_pdf_base64: Optional[str] = None  # 原始 PDF（用于保留未编辑页）
    page_width_pts: Optional[float] = None     # 页面宽度（pt），统一所有页面的尺寸
    page_height_pts: Optional[float] = None    # 页面高度（pt）


@app.get("/")
def root():
    return {"message": "SmartPDF Backend is running"}


@app.get("/health")
def health_check():
    return {"status": "ok", "active_sessions": len(editing_sessions)}


# ============ 会话自动清理 ============
def cleanup_expired_sessions():
    """清理超过 SESSION_EXPIRE_MINUTES 的过期会话"""
    now = datetime.now()
    expired = []
    for sid, create_time in list(session_creation_time.items()):
        if now - create_time > timedelta(minutes=SESSION_EXPIRE_MINUTES):
            expired.append(sid)
    for sid in expired:
        editing_sessions.pop(sid, None)
        page_sizes.pop(sid, None)
        page_pts_sizes.pop(sid, None)
        session_creation_time.pop(sid, None)
    if expired:
        logger.info(f"自动清理了 {len(expired)} 个过期会话: {expired}")


# ============ 新增：初始化编辑会话 ============
@app.post("/init-session", response_model=InitSessionResponse)
async def init_session():
    """初始化一个新的编辑会话"""
    cleanup_expired_sessions()
    session_id = str(uuid.uuid4())[:8]
    editing_sessions[session_id] = {}
    page_sizes[session_id] = {}
    page_pts_sizes[session_id] = {}
    session_creation_time[session_id] = datetime.now()
    logger.info(f"创建新会话: {session_id}")
    return InitSessionResponse(
        success=True,
        session_id=session_id,
        message="会话创建成功"
    )


# ============ 新增：保存页面图像 ============
@app.post("/save-page-image", response_model=SavePageImageResponse)
async def save_page_image(request: SavePageImageRequest):
    """保存编辑后的页面图像"""
    cleanup_expired_sessions()
    session_id = request.session_id
    page = request.page
    
    logger.info(f"收到保存请求: 会话={session_id}, 页码={page}, 尺寸={request.width:.0f}x{request.height:.0f}, base64长度={len(request.image_base64)}")
    
    try:
        if session_id not in editing_sessions:
            editing_sessions[session_id] = {}
            page_sizes[session_id] = {}
        image_base64 = request.image_base64
        if image_base64.startswith("data:image/") and "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]
            logger.info(f"移除了 data URL 前缀，新长度: {len(image_base64)}")
        editing_sessions[session_id][page] = image_base64
        page_sizes[session_id][page] = (request.width, request.height)
        if request.page_width_pts and request.page_height_pts:
            if session_id not in page_pts_sizes:
                page_pts_sizes[session_id] = {}
            page_pts_sizes[session_id][page] = (request.page_width_pts, request.page_height_pts)
        total_edited = len(editing_sessions[session_id])
        pts_info = f"，PDF尺寸={request.page_width_pts:.0f}x{request.page_height_pts:.0f}pts" if request.page_width_pts and request.page_height_pts else ""
        logger.info(f"会话 {session_id}: 第 {page} 页已保存 (共 {total_edited} 页已编辑){pts_info}")
        return SavePageImageResponse(
            success=True,
            message=f"第 {page} 页图像已保存",
            session_id=session_id
        )
    except Exception as e:
        logger.error(f"保存页面图像失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"保存失败: {str(e)}"}
        )


# ============ 新增：下载编辑后的 PDF ============
@app.post("/download-edited-pdf")
async def download_edited_pdf(request: DownloadEditedPdfRequest):
    """
    生成并下载编辑后的 PDF
    编辑页使用保存的图像，未编辑页保留原始 PDF 内容
    """
    cleanup_expired_sessions()
    session_id = request.session_id
    total_pages = request.total_pages
    original_pdf_base64 = request.original_pdf_base64
    
    logger.info(f"生成编辑后 PDF: 会话 {session_id}, 共 {total_pages} 页, 提供原始PDF={bool(original_pdf_base64)}")
    
    if session_id not in editing_sessions:
        return JSONResponse(
            status_code=404,
            content={"success": False, "message": "会话不存在或已过期"}
        )
    
    edited_pages = editing_sessions[session_id]
    
    try:
        from pypdf import PdfReader, PdfWriter
        from reportlab.pdfgen import canvas as pdf_canvas
        from reportlab.lib.utils import ImageReader

        output = PdfWriter()
        original_reader = None
        has_page_pts = session_id in page_pts_sizes

        # 加载原始 PDF
        if original_pdf_base64:
            try:
                original_bytes = base64.b64decode(original_pdf_base64)
                original_reader = PdfReader(io.BytesIO(original_bytes))
                logger.info(f"原始 PDF 加载成功，共 {len(original_reader.pages)} 页")
            except Exception as e:
                logger.warning(f"原始 PDF 解析失败: {e}，未编辑页将跳过")
        
        # 按页码顺序构建输出 PDF
        for page_num in range(1, total_pages + 1):
            if page_num in edited_pages:
                # 使用编辑后的图像，用 reportlab 创建正确尺寸的 PDF 页面
                image_base64 = edited_pages[page_num]
                image_data = base64.b64decode(image_base64)
                img = Image.open(io.BytesIO(image_data))
                if img.mode == 'RGBA':
                    img = img.convert('RGB')

                # 获取原始 PDF 页面尺寸（pt），确保与未编辑页一致
                if has_page_pts and page_num in page_pts_sizes[session_id]:
                    w_pts, h_pts = page_pts_sizes[session_id][page_num]
                else:
                    # 如果没有记录尺寸，用图像像素尺寸按 72 DPI 计算
                    w_pts, h_pts = img.width, img.height

                # 用 reportlab 创建 PDF 页面
                page_buf = io.BytesIO()
                c = pdf_canvas.Canvas(page_buf, pagesize=(w_pts, h_pts))
                # 将图像按页面尺寸缩放绘制
                c.drawImage(ImageReader(img), 0, 0, width=w_pts, height=h_pts)
                c.save()

                # 将 reportlab 页面添加到输出
                page_buf.seek(0)
                page_pdf = PdfReader(page_buf)
                for p in page_pdf.pages:
                    output.add_page(p)
                logger.info(f"第 {page_num} 页: 使用编辑后图像 ({w_pts:.0f}x{h_pts:.0f}pts)")
            elif original_reader and page_num <= len(original_reader.pages):
                # 使用原始 PDF 的页面
                output.add_page(original_reader.pages[page_num - 1])
                logger.info(f"第 {page_num} 页: 使用原始 PDF 内容")
            else:
                logger.info(f"第 {page_num} 页: 跳过（无原始内容）")
                continue
        
        # 写入输出 PDF
        pdf_buffer = io.BytesIO()
        output.write(pdf_buffer)
        pdf_buffer.seek(0)
        
        # 生成文件名
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"smartpdf_edited_{timestamp}.pdf"
        encoded_filename = quote(filename)
        
        logger.info(f"PDF 生成成功: {filename}, 大小 {len(pdf_buffer.getvalue())} 字节, 共 {len(output.pages)} 页")
        
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "X-Session-Id": session_id
            }
        )
    except Exception as e:
        logger.error(f"生成 PDF 失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"生成 PDF 失败: {str(e)}"}
        )


# ============ 新增：获取会话状态 ============
@app.get("/session/{session_id}/status")
async def get_session_status(session_id: str):
    cleanup_expired_sessions()
    if session_id not in editing_sessions:
        return {"success": False, "message": "会话不存在"}
    edited_pages = list(editing_sessions[session_id].keys())
    return {
        "success": True,
        "session_id": session_id,
        "edited_pages": edited_pages,
        "total_edited": len(edited_pages)
    }


# ============ 新增：清理会话 ============
@app.delete("/session/{session_id}")
async def clear_session(session_id: str):
    if session_id in editing_sessions:
        del editing_sessions[session_id]
    if session_id in page_sizes:
        del page_sizes[session_id]
    if session_id in page_pts_sizes:
        del page_pts_sizes[session_id]
    if session_id in session_creation_time:
        del session_creation_time[session_id]
    logger.info(f"会话 {session_id} 已清理")
    return {"success": True, "message": "会话已清理"}


def simulate_ai_processing(image_base64: str, startX: float, startY: float, endX: float, endY: float) -> dict:
    """
    模拟 AI 处理：在选区内添加模糊效果
    """
    logger.info("使用模拟模式处理图像")
    
    try:
        # 解码 Base64 图像
        image_data = base64.b64decode(image_base64)
        img = Image.open(io.BytesIO(image_data))
        
        # 转换为 RGB（如果是 RGBA）
        if img.mode == 'RGBA':
            img = img.convert('RGB')
        
        # 转换为 numpy 数组
        img_array = np.array(img)
        
        # 确保坐标在图像范围内
        height, width = img_array.shape[:2]
        startX_int = max(0, min(int(startX), width - 1))
        startY_int = max(0, min(int(startY), height - 1))
        endX_int = max(0, min(int(endX), width - 1))
        endY_int = max(0, min(int(endY), height - 1))
        
        # 确保 start < end
        if startX_int > endX_int:
            startX_int, endX_int = endX_int, startX_int
        if startY_int > endY_int:
            startY_int, endY_int = endY_int, startY_int
        
        # 选区尺寸
        sel_width = endX_int - startX_int
        sel_height = endY_int - startY_int
        
        if sel_width > 0 and sel_height > 0:
            # 在选区内添加明显的效果，让用户能看到变化
            # 方法1：添加半透明白色覆盖层（模拟手写被擦除）
            roi = img_array[startY_int:endY_int, startX_int:endX_int]
            
            # 创建白色覆盖层（带透明度）
            overlay = np.ones((sel_height, sel_width, 3), dtype=np.uint8) * 255
            
            # 混合原始图像和白色覆盖层（70%白色 + 30%原始）
            alpha = 0.7  # 白色覆盖层透明度
            roi = (roi * (1 - alpha) + overlay * alpha).astype(np.uint8)
            
            # 在选区边缘添加绿色边框，显示处理区域
            border_width = 3
            # 上边框
            roi[0:border_width, :] = [0, 255, 0]  # 绿色
            # 下边框
            roi[-border_width:, :] = [0, 255, 0]  # 绿色
            # 左边框
            roi[:, 0:border_width] = [0, 255, 0]  # 绿色
            # 右边框
            roi[:, -border_width:] = [0, 255, 0]  # 绿色
            
            # 更新图像数组
            img_array[startY_int:endY_int, startX_int:endX_int] = roi
            
            logger.info(f"模拟处理: 选区 ({startX_int}, {startY_int}) - ({endX_int}, {endY_int}), 尺寸 {sel_width}x{sel_height}")
        
        # 转换回图像
        processed_img = Image.fromarray(img_array)
        
        # 保存为 Base64
        buffered = io.BytesIO()
        processed_img.save(buffered, format="PNG")
        processed_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        return {
            "success": True,
            "message": f"模拟处理完成（选区 {sel_width}x{sel_height} 像素）",
            "processed_image": processed_base64,
            "is_simulated": True
        }
        
    except Exception as e:
        logger.error(f"模拟处理失败: {e}")
        # 失败时返回原始图像
        return {
            "success": True,
            "message": f"模拟处理失败，返回原始图像: {str(e)}",
            "processed_image": image_base64,
            "is_simulated": True
        }


def local_inpainting(image_data: bytes, image_base64: str, startX: float, startY: float, endX: float, endY: float) -> dict:
    """
    智能手写移除：
    1. 先按颜色检测（红色/彩色），只移除彩色像素，保留黑色文字
    2. 对于被手写覆盖的区域，使用 inpainting 修复
    """
    try:
        # 解码图像
        img = cv2.imdecode(np.frombuffer(image_data, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            pil_img = Image.open(io.BytesIO(image_data))
            if pil_img.mode == 'RGBA':
                pil_img = pil_img.convert('RGB')
            img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        
        height, width = img.shape[:2]
        
        # 确保坐标在图像范围内
        x1 = max(0, min(int(startX), width - 1))
        y1 = max(0, min(int(startY), height - 1))
        x2 = max(0, min(int(endX), width - 1))
        y2 = max(0, min(int(endY), height - 1))
        if x1 > x2: x1, x2 = x2, x1
        if y1 > y2: y1, y2 = y2, y1
        
        if x2 - x1 < 5 or y2 - y1 < 5:
            logger.warning(f"选区太小 ({x2-x1}x{y2-y1})，跳过处理")
            return {
                "success": True,
                "message": "选区太小，无需处理",
                "processed_image": image_base64,
                "is_simulated": False
            }
        
        logger.info(f"执行智能手写移除: 选区 ({x1},{y1})-({x2},{y2})")
        
        # 创建选区掩码
        selection_mask = np.zeros((height, width), dtype=np.uint8)
        selection_mask[y1:y2, x1:x2] = 255
        
        # 步骤1: 检测彩色像素（红色/蓝色/绿色等手写颜色）
        # RGB 颜色范围（宽松阈值以捕捉各种红色手写）
        # 在 BGR 色彩空间中，红色是 (0, 0, 255) 附近
        # 检测非灰色/非黑色的彩色像素
        
        # 转换到 HSV 以便更好地检测彩色
        img_hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        
        # 检测彩色像素（饱和度 > 阈值 且 非黑色）
        # 彩色像素在 HSV 中饱和度较高
        saturation = img_hsv[:, :, 1].astype(np.float32)
        value = img_hsv[:, :, 2].astype(np.float32)
        
        # 创建彩色掩码：饱和度 > 40 且 亮度 > 40（避免检测黑色文字）
        color_mask = np.zeros((height, width), dtype=np.uint8)
        color_mask[(saturation > 40) & (value > 40)] = 255
        
        # 只保留选区内的彩色像素
        color_mask_region = cv2.bitwise_and(color_mask, color_mask, mask=selection_mask)
        
        # 步骤2: 移除彩色像素（用白色替换）
        result = img.copy()
        result[color_mask_region > 0] = [255, 255, 255]
        
        # 步骤3: 对于被移除的大面积区域，使用 inpainting 修复
        # 彩色移除后可能会留下空洞，用 inpainting 填充
        combined_mask = selection_mask.copy()
        
        # 如果选区较大，进行 inpainting 平滑处理
        sel_area = (x2 - x1) * (y2 - y1)
        if sel_area > 5000:  # 仅对较大区域进行 inpainting
            logger.info(f"选区较大 ({sel_area} 像素)，应用 inpainting 平滑")
            result = cv2.inpaint(result, combined_mask, inpaintRadius=2, flags=cv2.INPAINT_TELEA)
        else:
            # 小区域：只对彩色移除区域进行轻微 inpainting
            result = cv2.inpaint(result, color_mask_region, inpaintRadius=1, flags=cv2.INPAINT_TELEA)
        
        # 将结果编码为 PNG
        success, encoded = cv2.imencode('.png', result)
        if not success:
            logger.error("图像编码失败")
            return {
                "success": True,
                "message": "本地处理编码失败",
                "processed_image": image_base64,
                "is_simulated": False
            }
        
        result_base64 = base64.b64encode(encoded.tobytes()).decode('utf-8')
        
        logger.info(f"智能手写移除完成，输出 {len(result_base64)} 字符")
        
        return {
            "success": True,
            "message": "手写已移除（智能颜色检测+图像修复）",
            "processed_image": result_base64,
            "is_simulated": False
        }
        
    except Exception as e:
        logger.error(f"智能手写移除失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": True,
            "message": f"本地处理失败: {str(e)}",
            "processed_image": image_base64,
            "is_simulated": False
        }



@app.post("/remove-handwriting", response_model=RemoveHandwritingResponse)
async def remove_handwriting(request: RemoveHandwritingRequest):
    """
    接收图片和选区坐标，调用 AI 去除手写批注
    """
    # 处理可能的 data URL 格式 (data:image/png;base64,...)
    image_base64 = request.image_base64
    if image_base64.startswith("data:image/") and "," in image_base64:
        # 提取纯 Base64 部分
        parts = image_base64.split(",", 1)
        image_base64 = parts[1]
        logger.info(f"提取 Base64 数据，移除 data URL 前缀，新长度: {len(image_base64)}")
    
    logger.info(f"收到去手写请求:")
    logger.info(f"  - 图片大小: {len(image_base64)} 字符")
    logger.info(f"  - 选区坐标: ({request.startX}, {request.startY}) -> ({request.endX}, {request.endY})")
    logger.info(f"  - 页码: {request.page}")
    
    # 检查选区尺寸
    width = abs(request.endX - request.startX)
    height = abs(request.endY - request.startY)
    MIN_SIZE = 5
    
    if width < MIN_SIZE or height < MIN_SIZE:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": f"选区太小 ({width:.0f}x{height:.0f} 像素)，请绘制更大的区域",
                "selection": {
                    "startX": request.startX,
                    "startY": request.startY,
                    "endX": request.endX,
                    "endY": request.endY,
                }
            }
        )
    
    # 调用 AI 处理
    # 优先使用本地 OpenCV inpainting（纯本地处理，不需要 API 密钥）
    # 仅在本地处理失败时回退到模拟模式
    try:
        image_data = base64.b64decode(image_base64)
        result = local_inpainting(
            image_data,
            image_base64,
            request.startX,
            request.startY,
            request.endX,
            request.endY
        )
    except Exception as e:
        logger.error(f"本地处理失败，回退到模拟模式: {e}")
        import traceback
        logger.error(traceback.format_exc())
        result = simulate_ai_processing(
            image_base64,
            request.startX,
            request.startY,
            request.endX,
            request.endY
        )
    
    # 添加选区信息到结果
    result["selection"] = {
        "startX": request.startX,
        "startY": request.startY,
        "endX": request.endX,
        "endY": request.endY,
    }
    
    return result


@app.post("/convert")
async def convert_to_pdf(file: UploadFile = File(...)):
    """
    将上传的文件转换为 PDF
    - .docx → 使用 LibreOffice 命令行转换（完美保留图片、表格、排版）
    - .pdf  → 直接返回原文件
    """
    # 获取文件名和扩展名
    filename = file.filename or "document"
    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    logger.info(f"收到转换请求: {filename}, 类型={ext}")

    # ========== 情况 1：直接上传 PDF ==========
    if ext == ".pdf":
        pdf_bytes = await file.read()
        encoded_filename = quote(filename)
        logger.info(f"直接返回 PDF 文件: {filename}, 大小 {len(pdf_bytes)} 字节")
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
        )

    # ========== 情况 2：docx 转 PDF（LibreOffice）==========
    elif ext == ".docx":
        docx_bytes = await file.read()
        logger.info(f"开始 LibreOffice 转换: {filename}, 大小 {len(docx_bytes)} 字节")

        # 创建临时目录
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, filename)
            output_dir = os.path.join(tmpdir, "output")
            os.makedirs(output_dir, exist_ok=True)

            # 保存 docx 到临时文件
            with open(input_path, "wb") as f:
                f.write(docx_bytes)

            # 调用 LibreOffice 命令行转换
            cmd = [
                LIBREOFFICE_PATH,
                "--headless",
                "--convert-to", "pdf",
                "--outdir", output_dir,
                input_path
            ]

            logger.info(f"执行命令: {' '.join(cmd)}")
            try:
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=120  # 120 秒超时
                )
                logger.info(f"LibreOffice 返回码: {result.returncode}")
                if result.stdout:
                    logger.info(f"LibreOffice 输出: {result.stdout}")
                if result.stderr:
                    logger.warning(f"LibreOffice 错误: {result.stderr}")
            except subprocess.TimeoutExpired:
                logger.error("LibreOffice 转换超时（120 秒）")
                return JSONResponse(
                    status_code=500,
                    content={"success": False, "message": "转换超时，请检查文件是否过大"}
                )
            except FileNotFoundError:
                logger.error(f"LibreOffice 未找到: {LIBREOFFICE_PATH}")
                return JSONResponse(
                    status_code=500,
                    content={"success": False, "message": f"LibreOffice 未安装或路径不正确: {LIBREOFFICE_PATH}"}
                )

            if result.returncode != 0:
                error_msg = result.stderr or "未知错误"
                logger.error(f"LibreOffice 转换失败: {error_msg}")
                return JSONResponse(
                    status_code=500,
                    content={"success": False, "message": f"LibreOffice 转换失败: {error_msg}"}
                )

            # 查找生成的 PDF 文件
            pdf_filename = os.path.splitext(filename)[0] + ".pdf"
            pdf_path = os.path.join(output_dir, pdf_filename)

            if not os.path.exists(pdf_path):
                # 尝试查找 output 目录下的任何 PDF 文件
                pdf_files = [f for f in os.listdir(output_dir) if f.endswith(".pdf")]
                if not pdf_files:
                    logger.error("LibreOffice 未生成 PDF 文件")
                    return JSONResponse(
                        status_code=500,
                        content={"success": False, "message": "LibreOffice 未生成 PDF 文件"}
                    )
                pdf_path = os.path.join(output_dir, pdf_files[0])
                logger.info(f"找到生成的 PDF: {pdf_files[0]}")

            # 读取生成的 PDF
            with open(pdf_path, "rb") as f:
                pdf_bytes = f.read()

        logger.info(f"转换成功: {pdf_filename}, 大小 {len(pdf_bytes)} 字节")
        encoded_filename = quote(pdf_filename)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
        )

    # ========== 情况 3：不支持的文件类型 ==========
    else:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": f"不支持的文件类型 '{ext}'，请上传 .docx 或 .pdf 文件"}
        )

