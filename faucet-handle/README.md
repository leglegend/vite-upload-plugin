# 新玛钢水龙头抽屉把手

把室外玛钢水龙头改成**单孔抽屉拉手**：原来的螺纹进水端改成穿抽屉面板的 M8 通杆，阀体横在抽屉面上，T 形手柄和下弯出水嘴当作握持部位。

## 安装方式

1. 在抽屉面板上钻 **Φ8 mm** 单孔（与普通单孔拉手相同）。
2. 从正面穿入把手螺杆，六角台紧贴木面。
3. 在抽屉内侧用 M8 螺母锁紧（模型已带内侧六角螺母外形）。
4. 拉开时握上方 T 杆，或把手指钩进下弯出水嘴。

建议抽屉板厚 16–20 mm。过厚时加长 `generate_stl.py` 里的通杆圆柱。

## 尺寸（毫米）

| 项目 | 约值 |
| --- | --- |
| 安装孔 | Φ8（M8） |
| 面板外突出 | 阀体约 55，T 杆更高 |
| 出水嘴侧向伸出 | 约 50 |
| T 杆宽度 | 约 52 |

精确包围盒以生成脚本打印值为准。

## 生成可打印 STL

```bash
python3 faucet-handle/generate_stl.py
```

输出：`faucet-handle/models/faucet-drawer-handle.stl`

切片时按 1:1 mm 导入。模型由若干相交实体组成，Cura / PrusaSlicer / Bambu Studio 会按并集处理。建议层高 0.2 mm，阀杆朝上摆放，支撑开在通杆和出水嘴下方。

## 浏览器预览

```bash
python3 -m http.server 8080 --directory faucet-handle
```

打开 `http://localhost:8080/preview/`。可旋转查看装在木抽屉上的效果，并下载 STL。

## 文件

- `generate_stl.py` — 参数化网格
- `models/faucet-drawer-handle.stl` — 打印文件
- `preview/index.html` — 柜体场景预览
