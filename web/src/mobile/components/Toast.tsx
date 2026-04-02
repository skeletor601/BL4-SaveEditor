import { useEffect, useState } from "react";

let toastTimeout: ReturnType<typeof setTimeout> | null = null;
let setGlobalToast: ((msg: string) => void) | null = null;

/** Show a toast from anywhere. */
export function showToast(msg: string) {
  setGlobalToast?.(msg);
}

export default function ToastContainer() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setGlobalToast = (m: string) => {
      if (toastTimeout) clearTimeout(toastTimeout);
      setMsg(m);
      toastTimeout = setTimeout(() => setMsg(null), 2000);
    };
    return () => { setGlobalToast = null; };
  }, []);

  if (!msg) return null;
  return <div className="mobile-toast">{msg}</div>;
}
