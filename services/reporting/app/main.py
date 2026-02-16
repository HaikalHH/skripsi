from io import BytesIO
from typing import List, Literal

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
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
