from io import BytesIO
from textwrap import wrap
from typing import List, Literal

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
from matplotlib.patches import FancyBboxPatch, Rectangle
from matplotlib.backends.backend_pdf import PdfPages
from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel, Field


class CategoryPoint(BaseModel):
    category: str
    total: float = Field(ge=0)


class TrendPoint(BaseModel):
    date: str
    income: float = Field(ge=0)
    expense: float = Field(ge=0)


class ChartRequest(BaseModel):
    period: Literal["daily", "weekly", "monthly"]
    incomeTotal: float = Field(ge=0)
    expenseTotal: float = Field(ge=0)
    categoryBreakdown: List[CategoryPoint]
    trend: List[TrendPoint]


class MonthlyPdfSection(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    lines: List[str] = Field(default_factory=list, max_length=40)


class MonthlyPdfRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    subtitle: str | None = Field(default=None, max_length=200)
    periodLabel: str = Field(min_length=1, max_length=120)
    summaryLines: List[str] = Field(default_factory=list, max_length=20)
    sections: List[MonthlyPdfSection] = Field(default_factory=list, max_length=12)


app = FastAPI(title="Finance Reporting Service")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/charts/generate")
def generate_chart(payload: ChartRequest):
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.5))
    fig.suptitle(f"Finance Report ({payload.period})", fontsize=14, fontweight="bold")

    axes[0].bar(["Income", "Expense"], [payload.incomeTotal, payload.expenseTotal], color=["#2563eb", "#dc2626"])
    axes[0].set_title("Income vs Expense")
    axes[0].set_ylabel("Amount")

    if payload.categoryBreakdown:
        labels = [item.category for item in payload.categoryBreakdown]
        values = [item.total for item in payload.categoryBreakdown]
        axes[1].pie(values, labels=labels, autopct="%1.1f%%", startangle=90)
        axes[1].set_title("Expense Category Share")
    else:
        axes[1].text(0.5, 0.5, "No expense data", ha="center", va="center")
        axes[1].set_title("Expense Category Share")
        axes[1].set_axis_off()

    if payload.trend:
        x = [item.date for item in payload.trend]
        income = [item.income for item in payload.trend]
        expense = [item.expense for item in payload.trend]
        axes[2].plot(x, income, label="Income", color="#2563eb")
        axes[2].plot(x, expense, label="Expense", color="#dc2626")
        axes[2].set_title("Trend")
        axes[2].tick_params(axis="x", rotation=45)
        axes[2].legend()
    else:
        axes[2].text(0.5, 0.5, "No trend data", ha="center", va="center")
        axes[2].set_title("Trend")
        axes[2].set_axis_off()

    fig.tight_layout()

    buffer = BytesIO()
    fig.savefig(buffer, format="png", dpi=140)
    plt.close(fig)
    buffer.seek(0)

    return Response(content=buffer.getvalue(), media_type="image/png")


PAGE_SIZE = (8.27, 11.69)
LEFT = 0.08
RIGHT = 0.92
TOP = 0.93
BLUE = "#2563eb"
RED = "#dc2626"
GREEN = "#16a34a"
PURPLE = "#6366e8"
LAVENDER = "#dfe2ff"
PALE_LAVENDER = "#f0f1ff"
TRACK = "#dddddd"
INK = "#111827"
MUTED = "#6b7280"
LINE = "#e5e7eb"
SOFT = "#f8fafc"


def _money_value(text: str) -> float:
    digits = "".join(char for char in text if char.isdigit())
    return float(digits or 0)


def _split_label_value(line: str) -> tuple[str, str]:
    separators = [":", "|"]
    for separator in separators:
        if separator in line:
            left, right = line.split(separator, 1)
            return left.strip(), right.strip()
    return line.strip(), ""


def _find_section(payload: MonthlyPdfRequest, title: str) -> MonthlyPdfSection | None:
    normalized = title.lower()
    for section in payload.sections:
        if section.title.lower() == normalized:
            return section
    return None


def _make_page() -> tuple[plt.Figure, plt.Axes]:
    fig = plt.figure(figsize=PAGE_SIZE)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_axis_off()
    return fig, ax


def _draw_footer(fig: plt.Figure, page_number: int) -> None:
    fig.text(LEFT, 0.035, "Finance Bot Monthly Report", fontsize=8, color=MUTED, ha="left", va="center")
    fig.text(RIGHT, 0.035, f"Page {page_number}", fontsize=8, color=MUTED, ha="right", va="center")


def _draw_title(fig: plt.Figure, payload: MonthlyPdfRequest, page_title: str | None = None) -> None:
    fig.text(LEFT, TOP, page_title or payload.title, fontsize=18, fontweight="bold", color=INK, ha="left", va="top")
    subtitle = payload.subtitle or payload.periodLabel
    fig.text(LEFT, TOP - 0.035, subtitle, fontsize=10, color=MUTED, ha="left", va="top")


def _draw_summary_cards(fig: plt.Figure, summary_lines: list[str]) -> None:
    cards = summary_lines[:6]
    if not cards:
        cards = ["Belum ada ringkasan tersedia"]

    columns = 3
    card_width = (RIGHT - LEFT - 0.03) / columns
    card_height = 0.078
    header_height = 0.026
    start_y = 0.855

    for index, line in enumerate(cards):
        row = index // columns
        col = index % columns
        x = LEFT + col * (card_width + 0.015)
        y = start_y - row * (card_height + 0.018)
        label, value = _split_label_value(line)
        fig.patches.append(
            FancyBboxPatch(
                (x, y - card_height),
                card_width,
                card_height,
                transform=fig.transFigure,
                boxstyle="round,pad=0.002,rounding_size=0.006",
                facecolor=LAVENDER,
                edgecolor="none",
                linewidth=0,
            )
        )
        fig.patches.append(
            Rectangle(
                (x, y - header_height),
                card_width,
                header_height,
                transform=fig.transFigure,
                facecolor=PURPLE,
                edgecolor="none",
                linewidth=0,
            )
        )
        fig.text(x + card_width / 2, y - 0.009, label, fontsize=6.8, fontweight="bold", color="white", ha="center", va="top")
        fig.text(
            x + card_width / 2,
            y - header_height - 0.028,
            value or label,
            fontsize=7.3,
            fontweight="bold",
            color=PURPLE,
            ha="center",
            va="top",
        )


def _parse_category_rows(section: MonthlyPdfSection | None) -> list[tuple[str, float, str]]:
    rows: list[tuple[str, float, str]] = []
    if not section:
        return rows

    for line in section.lines:
        cleaned = line
        if ". " in cleaned[:5]:
            cleaned = cleaned.split(". ", 1)[1]
        if ":" not in cleaned:
            continue
        category, amount_text = cleaned.split(":", 1)
        rows.append((category.strip(), _money_value(amount_text), amount_text.strip()))
    return rows


def _draw_category_chart(fig: plt.Figure, rows: list[tuple[str, float, str]], period_label: str) -> None:
    fig.text(LEFT, 0.62, "Top Expense Categories", fontsize=18, fontweight="bold", color=INK, ha="left", va="top")
    fig.text(LEFT, 0.587, period_label, fontsize=8, color=INK, ha="left", va="top")
    if not rows:
        fig.text(LEFT, 0.575, "Belum ada pengeluaran per kategori di periode ini.", fontsize=9, color=MUTED, ha="left")
        return

    chart_ax = fig.add_axes([LEFT + 0.075, 0.44, 0.73, 0.14])
    top_rows = rows[:6]
    labels = [row[0] for row in top_rows][::-1]
    values = [row[1] for row in top_rows][::-1]
    positions = list(range(len(top_rows)))
    max_value = max(values) if values else 0
    chart_ax.barh(positions, values, color=[PURPLE if index == len(values) - 1 else "#a9acf4" for index in range(len(values))])
    chart_ax.set_yticks(positions)
    chart_ax.set_yticklabels(labels, fontsize=6.4, color=PURPLE)
    chart_ax.tick_params(axis="y", length=0, pad=4)
    chart_ax.tick_params(axis="x", labelsize=6.4, colors=PURPLE)
    chart_ax.xaxis.set_major_formatter(FuncFormatter(_format_short_rupiah))
    chart_ax.get_xaxis().get_offset_text().set_visible(False)
    chart_ax.set_xlim(0, max_value * 1.12 if max_value > 0 else 1)
    chart_ax.grid(axis="x", color=LINE, linewidth=0.5)
    chart_ax.spines[["top", "right", "left"]].set_visible(False)
    chart_ax.spines["bottom"].set_color(LINE)

    total = sum(row[1] for row in rows)
    detail_top = 0.395
    column_width = 0.39
    row_gap = 0.052
    for index, (category, amount, amount_text) in enumerate(top_rows[:6]):
        col = index % 2
        row = index // 2
        x = LEFT + col * (column_width + 0.055)
        y = detail_top - row * row_gap
        share = (amount / total * 100) if total > 0 else 0
        fig.text(x, y, category[:30], fontsize=7.1, color=PURPLE, fontweight="bold", ha="left", va="top")
        fig.text(x + column_width, y, amount_text, fontsize=7.1, color=PURPLE, fontweight="bold", ha="right", va="top")
        fig.text(x, y - 0.017, f"{share:.1f}% dari total kategori", fontsize=6.6, color=PURPLE, ha="left", va="top")


def _draw_section_preview(fig: plt.Figure, section: MonthlyPdfSection | None, x: float, y: float) -> None:
    if not section:
        return
    fig.text(x, y, section.title, fontsize=11, fontweight="bold", color=INK, ha="left", va="top")
    cursor_y = y - 0.027
    for line in section.lines[:5]:
        wrapped = wrap(line, width=52)
        for index, wrapped_line in enumerate(wrapped[:2]):
            prefix = "- " if index == 0 else "  "
            fig.text(x + 0.012, cursor_y, f"{prefix}{wrapped_line}", fontsize=8, color=INK, ha="left", va="top")
            cursor_y -= 0.018
        if len(wrapped) > 2:
            fig.text(x + 0.012, cursor_y, "  ...", fontsize=8, color=MUTED, ha="left", va="top")
            cursor_y -= 0.018
        if cursor_y < 0.12:
            break


def _parse_ratio_percent(line: str) -> float:
    if "(" in line and "%)" in line:
        start = line.rfind("(") + 1
        end = line.rfind("%)")
        try:
            return float(line[start:end].replace(",", "."))
        except ValueError:
            return 0

    for part in line.split("|"):
        if "%" in part:
            return _extract_percent(part)
    return 0


def _strip_order_prefix(text: str) -> str:
    cleaned = text.strip()
    if ". " in cleaned[:5]:
        return cleaned.split(". ", 1)[1].strip()
    return cleaned


def _draw_progress_bar(fig: plt.Figure, x: float, y: float, width: float, percent: float, color: str) -> None:
    clamped = max(0, min(100, percent))
    height = 0.017
    fig.patches.append(
        FancyBboxPatch(
            (x, y - height),
            width,
            height,
            transform=fig.transFigure,
            boxstyle="round,pad=0,rounding_size=0.006",
            facecolor=TRACK,
            edgecolor="none",
        )
    )
    fill_width = width * (clamped / 100)
    if fill_width > 0:
        fig.patches.append(
            FancyBboxPatch(
                (x, y - height),
                max(fill_width, height),
                height,
                transform=fig.transFigure,
                boxstyle="round,pad=0,rounding_size=0.006",
                facecolor=color,
                edgecolor="none",
            )
        )


def _draw_budget_progress_preview(fig: plt.Figure, section: MonthlyPdfSection | None, x: float, y: float) -> None:
    if not section:
        return

    fig.text(x, y, section.title, fontsize=10, fontweight="bold", color=PURPLE, ha="left", va="top")
    cursor_y = y - 0.033
    width = 0.35
    for line in section.lines[:5]:
        name = line.split(":", 1)[0].strip()
        percent = _parse_ratio_percent(line)
        amount = line.split(":", 1)[1].split("(", 1)[0].strip() if ":" in line else ""
        fig.text(x, cursor_y, name[:28], fontsize=6.9, fontweight="bold", color=PURPLE, ha="left", va="top")
        fig.text(x + width, cursor_y, f"{percent:.1f}%", fontsize=6.9, color=PURPLE, ha="right", va="top")
        cursor_y -= 0.014
        _draw_progress_bar(fig, x, cursor_y, width, percent, PURPLE if percent < 80 else RED)
        fig.text(x, cursor_y - 0.019, amount[:42], fontsize=6.4, color=PURPLE, ha="left", va="top")
        cursor_y -= 0.046
        if cursor_y < 0.055:
            break


def _draw_goal_progress_preview(fig: plt.Figure, section: MonthlyPdfSection | None, x: float, y: float) -> None:
    if not section:
        return

    fig.text(x, y, section.title, fontsize=10, fontweight="bold", color=PURPLE, ha="left", va="top")
    cursor_y = y - 0.033
    width = 0.35
    for line in section.lines[:5]:
        parts = [part.strip() for part in _strip_order_prefix(line).split("|")]
        name = parts[0] if parts else line
        percent = _parse_ratio_percent(line)
        remaining = next((part for part in parts if part.lower().startswith("sisa ")), "")
        eta = next((part for part in parts if part.lower().startswith("eta ")), "")
        detail = " | ".join(part for part in [remaining, eta] if part)
        fig.text(x, cursor_y, name[:28], fontsize=6.9, fontweight="bold", color=PURPLE, ha="left", va="top")
        fig.text(x + width, cursor_y, f"{percent:.1f}%", fontsize=6.9, color=PURPLE, ha="right", va="top")
        cursor_y -= 0.014
        _draw_progress_bar(fig, x, cursor_y, width, percent, PURPLE)
        fig.text(x, cursor_y - 0.019, detail[:46], fontsize=6.4, color=PURPLE, ha="left", va="top")
        cursor_y -= 0.046
        if cursor_y < 0.055:
            break


def _draw_budget_goal_page(
    pdf: PdfPages,
    payload: MonthlyPdfRequest,
    budget_section: MonthlyPdfSection | None,
    goal_section: MonthlyPdfSection | None,
    page_number: int,
) -> bool:
    if not budget_section and not goal_section:
        return False

    fig, _ = _make_page()
    fig.text(LEFT, 0.93, "Budget & Progress Goal", fontsize=18, fontweight="bold", color=INK, ha="left", va="top")
    fig.text(LEFT, 0.895, payload.periodLabel, fontsize=9, color=MUTED, ha="left", va="top")
    _draw_budget_progress_preview(fig, budget_section, LEFT, 0.82)
    _draw_goal_progress_preview(fig, goal_section, 0.54, 0.82)
    _draw_footer(fig, page_number)
    pdf.savefig(fig)
    plt.close(fig)
    return True


def _draw_cover_page(pdf: PdfPages, payload: MonthlyPdfRequest, page_number: int) -> None:
    fig, _ = _make_page()
    fig.text(LEFT, 0.965, payload.title, fontsize=20, fontweight="bold", color="#050505", ha="left", va="top")
    fig.text(LEFT, 0.925, payload.periodLabel, fontsize=8.8, color="#050505", ha="left", va="top")
    _draw_summary_cards(fig, payload.summaryLines)
    _draw_category_chart(fig, _parse_category_rows(_find_section(payload, "Ringkasan Pengeluaran")), payload.periodLabel)
    pdf.savefig(fig)
    plt.close(fig)


def _expand_section_lines(section: MonthlyPdfSection) -> list[str]:
    rows: list[str] = []
    for line in section.lines:
        wrapped = wrap(line, width=96) or [line]
        rows.extend(wrapped)
    return rows or ["Belum ada data."]


def _chunk(values: list[str], size: int) -> list[list[str]]:
    return [values[index : index + size] for index in range(0, len(values), size)] or [[]]


def _extract_money(text: str) -> str:
    marker = "Rp"
    index = text.find(marker)
    if index < 0:
        return "-"
    value = text[index:].split("|", 1)[0].strip().rstrip(".")
    return value


def _format_short_rupiah(value: float, _position: float | None = None) -> str:
    absolute = abs(value)
    sign = "-" if value < 0 else ""
    if absolute >= 1_000_000:
        compact = absolute / 1_000_000
        text = f"{compact:.1f}".rstrip("0").rstrip(".")
        return f"{sign}Rp{text}jt"
    if absolute >= 1_000:
        compact = absolute / 1_000
        text = f"{compact:.0f}"
        return f"{sign}Rp{text}rb"
    return f"{sign}Rp{absolute:.0f}"


def _extract_first_sentence(text: str) -> str:
    sentence = text.split(".", 1)[0].strip()
    return sentence or text.strip()


def _extract_percent(text: str) -> float:
    percent_index = text.find("%")
    if percent_index < 0:
        return 0
    start = percent_index - 1
    while start >= 0 and (text[start].isdigit() or text[start] in ".,"):
        start -= 1
    raw = text[start + 1 : percent_index].replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return 0


def _parse_portfolio_asset_lines(lines: list[str]) -> list[dict[str, str | float]]:
    assets: list[dict[str, str | float]] = []
    for line in lines:
        if not line.lower().startswith("aset ") or "|" not in line:
            continue

        name_part, *detail_parts = [part.strip() for part in line.split("|")]
        name = name_part.split(":", 1)[1].strip() if ":" in name_part else name_part
        asset = {
            "name": name,
            "type": "-",
            "value": "-",
            "share": 0.0,
            "quantity": "-",
            "note": "",
        }
        for part in detail_parts:
            lowered = part.lower()
            if lowered.startswith("tipe:"):
                asset["type"] = part.split(":", 1)[1].strip()
            elif lowered.startswith("nilai:"):
                asset["value"] = part.split(":", 1)[1].strip()
            elif lowered.startswith("porsi:"):
                asset["share"] = _extract_percent(part)
            elif lowered.startswith("jumlah:"):
                asset["quantity"] = part.split(":", 1)[1].strip()
            elif "modal" in lowered:
                asset["note"] = part
        assets.append(asset)
    return assets


def _clean_report_line(line: str) -> str:
    cleaned = line.strip()
    while cleaned.startswith("-"):
        cleaned = cleaned[1:].strip()
    return cleaned


def _find_line_value(lines: list[str], label: str) -> str:
    normalized_label = label.lower()
    for line in lines:
        cleaned = _clean_report_line(line)
        if cleaned.lower().startswith(normalized_label) and ":" in cleaned:
            return cleaned.split(":", 1)[1].strip()
    return "-"


def _collect_lines_after(lines: list[str], marker: str, stop_markers: list[str]) -> list[str]:
    results: list[str] = []
    collecting = False
    normalized_marker = marker.lower()
    normalized_stops = [item.lower() for item in stop_markers]
    for line in lines:
        cleaned = _clean_report_line(line)
        lowered = cleaned.lower()
        if lowered.startswith(normalized_marker):
            collecting = True
            continue
        if collecting and any(lowered.startswith(stop_marker) for stop_marker in normalized_stops):
            break
        if collecting and cleaned:
            results.append(cleaned.rstrip("."))
    return results


def _draw_portfolio_page(
    pdf: PdfPages,
    payload: MonthlyPdfRequest,
    section: MonthlyPdfSection,
    page_number: int,
) -> None:
    fig, _ = _make_page()
    _draw_title(fig, payload, section.title)

    summary_lines = [line for line in section.lines if not line.lower().startswith("aset ") and line != "Daftar aset:"]
    assets = _parse_portfolio_asset_lines(section.lines)
    total_value = _extract_money(summary_lines[0]) if summary_lines else "-"

    card_y = 0.825
    card_height = 0.085
    card_width = 0.32
    fig.patches.append(
        Rectangle(
            (LEFT, card_y - card_height),
            card_width,
            card_height,
            transform=fig.transFigure,
            facecolor=SOFT,
            edgecolor=LINE,
            linewidth=0.8,
        )
    )
    fig.text(LEFT + 0.013, card_y - 0.018, "TOTAL ASET", fontsize=7.4, color=MUTED, ha="left", va="top")
    fig.text(LEFT + 0.013, card_y - 0.044, total_value, fontsize=11.5, fontweight="bold", color=INK, ha="left", va="top")
    fig.text(LEFT + 0.013, card_y - 0.067, "nilai semua aset saat ini", fontsize=7.2, color=MUTED, ha="left", va="top")

    if assets:
        fig.text(LEFT, 0.69, "Porsi aset", fontsize=12, fontweight="bold", color=INK, ha="left", va="top")
        chart_ax = fig.add_axes([LEFT, 0.49, 0.52, 0.17])
        top_assets = assets[:6]
        labels = [str(item["name"]) for item in top_assets][::-1]
        shares = [float(item["share"]) for item in top_assets][::-1]
        positions = list(range(len(top_assets)))
        chart_ax.barh(positions, shares, color=GREEN)
        chart_ax.set_yticks(positions)
        chart_ax.set_yticklabels([])
        chart_ax.set_xlim(0, max(100, max(shares) * 1.15 if shares else 100))
        chart_ax.tick_params(axis="y", length=0)
        chart_ax.tick_params(axis="x", labelsize=8)
        chart_ax.grid(axis="x", color=LINE, linewidth=0.7)
        chart_ax.spines[["top", "right", "left"]].set_visible(False)
        chart_ax.spines["bottom"].set_color(LINE)
        chart_ax.set_xlabel("Porsi dari total aset (%)", fontsize=8, color=MUTED)

        for position, label, share in zip(positions, labels, shares):
            display_label = label if len(label) <= 21 else f"{label[:18]}..."
            chart_ax.text(1.5, position, display_label, va="center", ha="left", fontsize=8, color="white", fontweight="bold")
            chart_ax.text(min(share + 1, 98), position, f"{share:.1f}%", va="center", ha="left", fontsize=8, color=INK)

        type_totals: dict[str, float] = {}
        for asset in assets:
            asset_type = str(asset["type"])
            type_totals[asset_type] = type_totals.get(asset_type, 0) + float(asset["share"])
        pie_labels = list(type_totals.keys())[:5]
        pie_values = [type_totals[label] for label in pie_labels]
        pie_ax = fig.add_axes([0.67, 0.49, 0.18, 0.16])
        pie_ax.pie(
            pie_values,
            colors=["#16a34a", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed"],
            startangle=90,
            wedgeprops={"width": 0.42, "edgecolor": "white"},
        )
        pie_ax.set_aspect("equal")
        fig.text(0.62, 0.69, "Komposisi tipe aset", fontsize=12, fontweight="bold", color=INK, ha="left", va="top")
        for index, label in enumerate(pie_labels):
            color = ["#16a34a", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed"][index]
            col = index % 2
            row = index // 2
            legend_x = 0.62 + col * 0.18
            legend_y = 0.475 - row * 0.028
            fig.patches.append(
                Rectangle(
                    (legend_x, legend_y - 0.008),
                    0.012,
                    0.012,
                    transform=fig.transFigure,
                    facecolor=color,
                    edgecolor="none",
                )
            )
            fig.text(
                legend_x + 0.018,
                legend_y,
                f"{label[:13]} {type_totals[label]:.1f}%",
                fontsize=7.2,
                color=INK,
                ha="left",
                va="center",
            )

    fig.text(LEFT, 0.385, "Daftar aset", fontsize=12, fontweight="bold", color=INK, ha="left", va="top")
    table_y = 0.35
    headers = [("Aset", LEFT + 0.01), ("Tipe", 0.32), ("Nilai", 0.53), ("Porsi", 0.71), ("Perubahan", 0.81)]
    fig.patches.append(
        Rectangle((LEFT, table_y - 0.027), RIGHT - LEFT, 0.03, transform=fig.transFigure, facecolor=SOFT, edgecolor=LINE)
    )
    for label, x in headers:
        fig.text(x, table_y - 0.006, label, fontsize=8, fontweight="bold", color=MUTED, ha="left", va="top")
    table_y -= 0.04

    for asset in assets[:10]:
        note = str(asset["note"]).replace(" dari modal", "")
        fig.text(LEFT + 0.01, table_y, str(asset["name"])[:24], fontsize=7.8, color=INK, ha="left", va="top")
        fig.text(0.32, table_y, str(asset["type"])[:19], fontsize=7.8, color=INK, ha="left", va="top")
        fig.text(0.53, table_y, str(asset["value"]), fontsize=7.8, color=INK, ha="left", va="top")
        fig.text(0.71, table_y, f"{float(asset['share']):.1f}%", fontsize=8, color=INK, ha="left", va="top")
        fig.text(0.81, table_y, note[:19], fontsize=7.8, color=INK, ha="left", va="top")
        table_y -= 0.033
        fig.patches.append(
            Rectangle((LEFT, table_y + 0.011), RIGHT - LEFT, 0.001, transform=fig.transFigure, facecolor=LINE, edgecolor="none")
        )

    if len(assets) > 10:
        fig.text(LEFT + 0.01, table_y, f"Masih ada {len(assets) - 10} aset lain.", fontsize=8, color=MUTED, ha="left", va="top")

    _draw_footer(fig, page_number)
    pdf.savefig(fig)
    plt.close(fig)


def _draw_financial_closing_page(
    pdf: PdfPages,
    payload: MonthlyPdfRequest,
    section: MonthlyPdfSection,
    page_number: int,
) -> None:
    fig, _ = _make_page()
    _draw_title(fig, payload, section.title)

    lines = [_clean_report_line(line) for line in section.lines]
    income_text = _find_line_value(lines, "Income")
    expense_text = _find_line_value(lines, "Expense")
    saving_text = _find_line_value(lines, "Net saving")
    saving_rate_text = _find_line_value(lines, "Saving rate")
    health_text = _find_line_value(lines, "Health score")
    top_category_text = _find_line_value(lines, "Kategori terbesar")
    income = _money_value(income_text)
    expense = _money_value(expense_text)
    saving = _money_value(saving_text)
    saving_rate = _extract_percent(saving_rate_text)
    health_score_text = health_text.split("/", 1)[0].strip()
    try:
        health_score = max(0, min(100, float(health_score_text)))
    except ValueError:
        health_score = 0

    cards = [
        ("MASUK", income_text, BLUE),
        ("KELUAR", expense_text, RED),
        ("SISA", saving_text, GREEN if saving >= 0 else RED),
    ]
    card_width = (RIGHT - LEFT - 0.036) / 3
    for index, (label, value, color) in enumerate(cards):
        x = LEFT + index * (card_width + 0.018)
        fig.patches.append(
            Rectangle((x, 0.755), card_width, 0.085, transform=fig.transFigure, facecolor=SOFT, edgecolor=LINE, linewidth=0.8)
        )
        fig.patches.append(
            Rectangle((x, 0.755), 0.008, 0.085, transform=fig.transFigure, facecolor=color, edgecolor="none")
        )
        fig.text(x + 0.018, 0.815, label, fontsize=7.5, color=MUTED, ha="left", va="top")
        fig.text(x + 0.018, 0.787, value, fontsize=12, fontweight="bold", color=INK, ha="left", va="top")

    fig.text(LEFT, 0.69, "Arus uang bulan ini", fontsize=12, fontweight="bold", color=INK, ha="left", va="top")
    bar_ax = fig.add_axes([LEFT, 0.545, 0.5, 0.105])
    bar_labels = ["Masuk", "Keluar", "Sisa"]
    bar_values = [income, expense, max(0, saving)]
    bar_colors = [BLUE, RED, GREEN]
    bar_ax.barh(list(range(3)), bar_values, color=bar_colors, height=0.55)
    bar_ax.set_yticks(list(range(3)))
    bar_ax.set_yticklabels(bar_labels, fontsize=8)
    bar_ax.invert_yaxis()
    bar_ax.tick_params(axis="x", labelsize=8)
    bar_ax.xaxis.set_major_formatter(FuncFormatter(_format_short_rupiah))
    bar_ax.get_xaxis().get_offset_text().set_visible(False)
    bar_ax.grid(axis="x", color=LINE, linewidth=0.7)
    bar_ax.spines[["top", "right", "left"]].set_visible(False)
    bar_ax.spines["bottom"].set_color(LINE)
    max_bar_value = max(bar_values) if bar_values else 0
    bar_ax.set_xlim(0, max_bar_value * 1.18 if max_bar_value > 0 else 1)
    for position, value, label in zip(list(range(3)), bar_values, [income_text, expense_text, saving_text]):
        bar_ax.text(
            value + max_bar_value * 0.025,
            position,
            label,
            va="center",
            ha="left",
            fontsize=8,
            color=INK,
            fontweight="bold",
        )

    fig.text(0.63, 0.69, "Kondisi umum", fontsize=12, fontweight="bold", color=INK, ha="left", va="top")
    gauge_ax = fig.add_axes([0.63, 0.545, 0.16, 0.13])
    gauge_color = GREEN if health_score >= 72 else "#f59e0b" if health_score >= 58 else RED
    gauge_ax.pie(
        [health_score, 100 - health_score],
        colors=[gauge_color, LINE],
        startangle=90,
        counterclock=False,
        wedgeprops={"width": 0.32, "edgecolor": "white"},
    )
    gauge_ax.set_aspect("equal")
    fig.text(0.71, 0.61, f"{health_score:.0f}", fontsize=18, fontweight="bold", color=INK, ha="center", va="center")
    fig.text(0.71, 0.585, "/100", fontsize=8, color=MUTED, ha="center", va="center")

    fig.patches.append(
        Rectangle((0.81, 0.58), 0.1, 0.038, transform=fig.transFigure, facecolor="#ecfdf5" if saving >= 0 else "#fef2f2", edgecolor=LINE)
    )
    fig.text(0.86, 0.603, "POSITIF" if saving >= 0 else "MINUS", fontsize=8, fontweight="bold", color=GREEN if saving >= 0 else RED, ha="center", va="center")
    fig.text(0.81, 0.55, f"Saving rate {saving_rate:.1f}%", fontsize=8.5, color=INK, ha="left", va="top")

    if top_category_text != "-":
        fig.text(LEFT, 0.475, "Pengeluaran paling besar", fontsize=12, fontweight="bold", color=INK, ha="left", va="top")
        category = top_category_text.split("(", 1)[0].strip()
        amount = top_category_text[top_category_text.find("(") + 1 : top_category_text.rfind(")")] if "(" in top_category_text else top_category_text
        fig.patches.append(
            Rectangle((LEFT, 0.415), 0.46, 0.042, transform=fig.transFigure, facecolor="#fff7ed", edgecolor="#fed7aa", linewidth=0.8)
        )
        fig.text(LEFT + 0.014, 0.44, category[:34], fontsize=10, fontweight="bold", color=INK, ha="left", va="top")
        fig.text(0.5, 0.44, amount, fontsize=10, fontweight="bold", color=RED, ha="right", va="top")

    positives = _collect_lines_after(lines, "Highlight positif", ["Fokus bulan berikutnya"])
    focus_items = _collect_lines_after(lines, "Fokus bulan berikutnya", [])
    chips = [("Yang sudah oke", positives[:3], "#ecfdf5", "#166534"), ("Perlu dilirik", focus_items[:3], "#fff7ed", "#9a3412")]
    start_y = 0.36
    for column, (title, items, fill, text_color) in enumerate(chips):
        x = LEFT + column * 0.43
        fig.text(x, start_y, title, fontsize=11, fontweight="bold", color=INK, ha="left", va="top")
        y = start_y - 0.035
        if not items:
            items = ["Belum ada catatan besar"]
        for item in items[:3]:
            short_item = _extract_first_sentence(item)
            fig.patches.append(
                Rectangle((x, y - 0.036), 0.38, 0.032, transform=fig.transFigure, facecolor=fill, edgecolor=LINE, linewidth=0.7)
            )
            fig.text(x + 0.012, y - 0.013, short_item[:48], fontsize=7.8, color=text_color, ha="left", va="center")
            y -= 0.045

    _draw_footer(fig, page_number)
    pdf.savefig(fig)
    plt.close(fig)


def _draw_transaction_page(
    pdf: PdfPages,
    payload: MonthlyPdfRequest,
    section: MonthlyPdfSection,
    lines: list[str],
    page_number: int,
    part_number: int,
    total_parts: int,
) -> None:
    fig, _ = _make_page()
    _draw_title(fig, payload, f"{section.title}{f' ({part_number}/{total_parts})' if total_parts > 1 else ''}")

    y = 0.84
    row_height = 0.024
    fig.patches.append(
        Rectangle((LEFT, y - 0.026), RIGHT - LEFT, 0.028, transform=fig.transFigure, facecolor=SOFT, edgecolor=LINE)
    )
    headers = [("Tanggal", LEFT + 0.015), ("Tipe", LEFT + 0.14), ("Detail", LEFT + 0.25), ("Nominal", RIGHT - 0.015)]
    for label, x in headers:
        fig.text(x, y - 0.006, label, fontsize=8, fontweight="bold", color=MUTED, ha="right" if label == "Nominal" else "left", va="top")
    y -= 0.035

    for raw_line in lines:
        text = raw_line
        if ". " in text[:5]:
            text = text.split(". ", 1)[1]
        parts = [part.strip() for part in text.split("|")]
        if len(parts) >= 4:
            date, tx_type, detail, amount = parts[0], parts[1], parts[2], parts[-1]
            type_color = GREEN if tx_type.upper() == "INCOME" else RED if tx_type.upper() == "EXPENSE" else BLUE
            fig.text(LEFT + 0.015, y, date, fontsize=8, color=INK, ha="left", va="top")
            fig.text(LEFT + 0.14, y, tx_type, fontsize=8, color=type_color, ha="left", va="top")
            fig.text(LEFT + 0.25, y, detail[:58], fontsize=8, color=INK, ha="left", va="top")
            fig.text(RIGHT - 0.015, y, amount, fontsize=8, color=INK, ha="right", va="top")
        else:
            fig.text(LEFT + 0.015, y, raw_line, fontsize=8, color=INK, ha="left", va="top")
        y -= row_height
        fig.patches.append(Rectangle((LEFT, y + 0.004), RIGHT - LEFT, 0.001, transform=fig.transFigure, facecolor=LINE, edgecolor="none"))

    _draw_footer(fig, page_number)
    pdf.savefig(fig)
    plt.close(fig)


def _draw_text_section_page(
    pdf: PdfPages,
    payload: MonthlyPdfRequest,
    section: MonthlyPdfSection,
    lines: list[str],
    page_number: int,
    part_number: int,
    total_parts: int,
) -> None:
    fig, _ = _make_page()
    _draw_title(fig, payload, f"{section.title}{f' ({part_number}/{total_parts})' if total_parts > 1 else ''}")
    y = 0.84
    for line in lines:
        fig.text(LEFT + 0.012, y, f"- {line}", fontsize=9, color=INK, ha="left", va="top")
        y -= 0.026
    _draw_footer(fig, page_number)
    pdf.savefig(fig)
    plt.close(fig)


def _render_detail_pages(pdf: PdfPages, payload: MonthlyPdfRequest, start_page_number: int) -> int:
    page_number = start_page_number
    cover_sections = {"ringkasan pengeluaran", "budget bulanan", "progress goal"}
    for section in payload.sections:
        normalized_title = section.title.lower()
        if normalized_title in cover_sections:
            continue

        lines = section.lines if normalized_title == "daftar transaksi" else _expand_section_lines(section)
        per_page = 28 if normalized_title == "daftar transaksi" else 30
        chunks = _chunk(lines, per_page)
        for index, page_lines in enumerate(chunks):
            if normalized_title == "portfolio & aset":
                _draw_portfolio_page(pdf, payload, section, page_number)
                page_number += 1
                break
            if normalized_title == "financial closing":
                _draw_financial_closing_page(pdf, payload, section, page_number)
                page_number += 1
                break
            if normalized_title == "daftar transaksi":
                _draw_transaction_page(pdf, payload, section, page_lines, page_number, index + 1, len(chunks))
            else:
                _draw_text_section_page(pdf, payload, section, page_lines, page_number, index + 1, len(chunks))
            page_number += 1

    return page_number


@app.post("/reports/monthly-pdf")
def generate_monthly_pdf(payload: MonthlyPdfRequest):
    buffer = BytesIO()
    with PdfPages(buffer) as pdf:
        _draw_cover_page(pdf, payload, page_number=1)
        next_page_number = 2
        if _draw_budget_goal_page(
            pdf,
            payload,
            _find_section(payload, "Budget Bulanan"),
            _find_section(payload, "Progress Goal"),
            page_number=next_page_number,
        ):
            next_page_number += 1
        _render_detail_pages(pdf, payload, start_page_number=next_page_number)

    buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf")
