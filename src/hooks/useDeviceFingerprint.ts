import { useEffect, useState } from "react";

interface DeviceInfo {
  fingerprint: string;
  browser: string;
  os: string;
  device_name: string;
}

// Simple device fingerprinting (for production, consider using FingerprintJS)
export function useDeviceFingerprint() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);

  useEffect(() => {
    const generateFingerprint = async () => {
      // Collect browser characteristics
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.textBaseline = "top";
        ctx.font = "14px Arial";
        ctx.fillText("ThriftPal", 2, 2);
      }
      const canvasData = canvas.toDataURL();

      const screenData = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const language = navigator.language;
      const platform = navigator.platform;
      const userAgent = navigator.userAgent;
      const hardwareConcurrency = navigator.hardwareConcurrency || "unknown";
      const deviceMemory = (navigator as any).deviceMemory || "unknown";

      // Combine into fingerprint string
      const fingerprintString = [
        canvasData,
        screenData,
        timezone,
        language,
        platform,
        userAgent,
        hardwareConcurrency,
        deviceMemory,
      ].join("|");

      // Hash the fingerprint
      const encoder = new TextEncoder();
      const data = encoder.encode(fingerprintString);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fingerprint = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

      // Detect browser
      let browser = "Unknown Browser";
      if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) {
        browser = "Chrome";
      } else if (userAgent.includes("Firefox")) {
        browser = "Firefox";
      } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
        browser = "Safari";
      } else if (userAgent.includes("Edg")) {
        browser = "Edge";
      } else if (userAgent.includes("Opera") || userAgent.includes("OPR")) {
        browser = "Opera";
      }

      // Detect OS
      let os = "Unknown OS";
      if (userAgent.includes("Windows")) {
        os = "Windows";
      } else if (userAgent.includes("Mac")) {
        os = "macOS";
      } else if (userAgent.includes("Linux") && !userAgent.includes("Android")) {
        os = "Linux";
      } else if (userAgent.includes("Android")) {
        os = "Android";
      } else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
        os = "iOS";
      }

      // Generate device name
      const device_name = `${browser} on ${os}`;

      setDeviceInfo({
        fingerprint: fingerprint.slice(0, 32), // Use first 32 chars
        browser,
        os,
        device_name,
      });
    };

    generateFingerprint();
  }, []);

  return deviceInfo;
}
