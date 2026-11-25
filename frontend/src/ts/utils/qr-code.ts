/** PNG of a QR code, generated locally so the text never leaves the browser. */
export async function generateQrCodeImage(text: string): Promise<Blob> {
  const { default: QRCode } = await import("qrcode");
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, text, {
    width: 1024,
    margin: 4,
    errorCorrectionLevel: "M",
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("Could not create QR code image"));
      } else {
        resolve(blob);
      }
    }, "image/png");
  });
}
