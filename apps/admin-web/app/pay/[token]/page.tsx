import { fetchPublicApi } from "@/lib/api";
import { confirmPaymentAction } from "./actions";

type PaymentPageProps = {
  params: { token: string };
  searchParams?: { paid?: string; error?: string };
};

type PaymentSessionResponse = {
  token: string;
  status: "PENDING" | "PAID" | "EXPIRED";
  amount: number;
  waNumber: string;
  paidAt: string | null;
  createdAt: string;
};

export default async function PaymentPage({ params, searchParams }: PaymentPageProps) {
  let session: PaymentSessionResponse | null = null;
  try {
    session = await fetchPublicApi<PaymentSessionResponse>(
      `/api/public/payment/session?token=${params.token}`
    );
  } catch {
    session = null;
  }

  if (!session) {
    return (
      <div className="card" style={{ maxWidth: 580, margin: "60px auto" }}>
        <h1>Payment Link Invalid</h1>
        <p>Token pembayaran tidak ditemukan atau sudah tidak berlaku.</p>
      </div>
    );
  }

  const alreadyPaid = session.status === "PAID" || searchParams?.paid === "1";

  return (
    <div className="card" style={{ maxWidth: 640, margin: "60px auto" }}>
      <h1>Dummy Payment Page</h1>
      <p>Ini simulasi pembayaran subscription untuk WhatsApp Finance Bot.</p>

      <table style={{ marginTop: 12, marginBottom: 12 }}>
        <tbody>
          <tr>
            <th>Nomor WhatsApp</th>
            <td>{session.waNumber}</td>
          </tr>
          <tr>
            <th>Nominal</th>
            <td>{session.amount.toFixed(0)}</td>
          </tr>
          <tr>
            <th>Status</th>
            <td>{alreadyPaid ? "PAID" : session.status}</td>
          </tr>
        </tbody>
      </table>

      {alreadyPaid ? (
        <p style={{ color: "#166534", fontWeight: 600 }}>
          Pembayaran sudah terkonfirmasi. Bot akan kirim notifikasi bahwa subscription aktif.
        </p>
      ) : (
        <form action={confirmPaymentAction}>
          <input type="hidden" name="token" value={session.token} />
          <button type="submit">Paid</button>
        </form>
      )}

      {searchParams?.error === "1" ? (
        <p style={{ color: "#b91c1c" }}>Gagal konfirmasi pembayaran. Silakan coba lagi.</p>
      ) : null}
    </div>
  );
}
