from io import BytesIO
from textwrap import wrap
from typing import List, Literal

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
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


def _append_wrapped_lines(items: list[tuple[str, str]], text: str, kind: str, width: int) -> None:
    wrapped = wrap(text, width=width) or [text]
    if kind == "bullet":
        first = True
        for line in wrapped:
            prefix = "- " if first else "  "
            items.append((kind, f"{prefix}{line}"))
            first = False
        return

    for line in wrapped:
        items.append((kind, line))


def _build_monthly_pdf_lines(payload: MonthlyPdfRequest) -> list[tuple[str, str]]:
    items: list[tuple[str, str]] = [("meta", f"Periode: {payload.periodLabel}"), ("spacer", "")]

    if payload.summaryLines:
        items.append(("heading", "Ringkasan Utama"))
        for line in payload.summaryLines:
            _append_wrapped_lines(items, line, "bullet", 88)
        items.append(("spacer", ""))

    for section in payload.sections:
        items.append(("heading", section.title))
        for line in section.lines:
            _append_wrapped_lines(items, line, "bullet", 88)
        items.append(("spacer", ""))

    return items


def _paginate_lines(items: list[tuple[str, str]]) -> list[list[tuple[str, str]]]:
    pages: list[list[tuple[str, str]]] = []
    current_page: list[tuple[str, str]] = []
    current_line_count = 0

    for kind, text in items:
        line_cost = 1 if kind != "spacer" else 0
        max_lines = 28 if not pages else 38
        if current_page and current_line_count + line_cost > max_lines:
            pages.append(current_page)
            current_page = []
            current_line_count = 0

        current_page.append((kind, text))
        current_line_count += line_cost

    if current_page:
        pages.append(current_page)

    return pages or [[("bullet", "Belum ada data untuk report ini.")]]


def _render_pdf_page(
    pdf: PdfPages,
    payload: MonthlyPdfRequest,
    page_items: list[tuple[str, str]],
    is_first_page: bool,
) -> None:
    fig = plt.figure(figsize=(8.27, 11.69))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_axis_off()

    y = 0.95
    if is_first_page:
        fig.text(0.08, y, payload.title, fontsize=18, fontweight="bold", ha="left", va="top")
        y -= 0.035
        if payload.subtitle:
            fig.text(0.08, y, payload.subtitle, fontsize=11, color="#4b5563", ha="left", va="top")
            y -= 0.03
        y -= 0.01
    else:
        fig.text(
            0.08,
            y,
            f"{payload.title} (lanjutan)",
            fontsize=13,
            fontweight="bold",
            ha="left",
            va="top",
        )
        y -= 0.04

    line_height = 0.022
    for kind, text in page_items:
        if kind == "spacer":
            y -= line_height * 0.4
            continue

        if kind == "heading":
            fig.text(0.08, y, text, fontsize=12, fontweight="bold", ha="left", va="top")
        elif kind == "meta":
            fig.text(0.08, y, text, fontsize=10, color="#4b5563", ha="left", va="top")
        else:
            fig.text(0.1, y, text, fontsize=10, ha="left", va="top")
        y -= line_height

    pdf.savefig(fig)
    plt.close(fig)


@app.post("/reports/monthly-pdf")
def generate_monthly_pdf(payload: MonthlyPdfRequest):
    lines = _build_monthly_pdf_lines(payload)
    pages = _paginate_lines(lines)

    buffer = BytesIO()
    with PdfPages(buffer) as pdf:
        for index, page_items in enumerate(pages):
            _render_pdf_page(pdf, payload, page_items, is_first_page=index == 0)

    buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf")
