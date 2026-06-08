import { ImageResponse } from "next/og";
import { siteDescription, siteName } from "../src/lib/siteRoutes";

export const alt = "Opendocs document tools workspace";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f8fafc",
          color: "#0f172a",
          padding: "64px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "16px",
              background: "#059669",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "30px",
              fontWeight: 800,
            }}
          >
            OD
          </div>
          <div style={{ fontSize: "44px", fontWeight: 800 }}>{siteName}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ maxWidth: "920px", fontSize: "72px", lineHeight: 1.02, fontWeight: 900 }}>
            Private PDF and document tools in your browser
          </div>
          <div style={{ marginTop: "28px", maxWidth: "860px", fontSize: "30px", lineHeight: 1.35, color: "#334155" }}>
            {siteDescription}
          </div>
        </div>
        <div style={{ display: "flex", gap: "14px", fontSize: "24px", color: "#0f766e", fontWeight: 700 }}>
          <span>Scan to PDF</span>
          <span>Merge PDFs</span>
          <span>Convert</span>
          <span>Edit</span>
          <span>Compress</span>
        </div>
      </div>
    ),
    size
  );
}
