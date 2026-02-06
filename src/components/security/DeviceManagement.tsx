import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Smartphone, Monitor, Trash2, Shield, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSecurity } from "@/hooks/useSecurity";
import { useDeviceFingerprint } from "@/hooks/useDeviceFingerprint";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface DeviceInfo {
  id: string;
  device_name: string;
  browser: string | null;
  os: string | null;
  is_trusted: boolean;
  is_current: boolean;
  last_used_at: string;
  created_at: string;
  device_fingerprint?: string;
}

interface DeviceManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeviceManagement({ open, onOpenChange }: DeviceManagementProps) {
  const { getDevices, removeDevice, trustDevice, loading } = useSecurity();
  const deviceInfo = useDeviceFingerprint();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);

  const fetchDevices = async () => {
    setLoadingDevices(true);
    const deviceList = await getDevices();
    setDevices(deviceList);
    setLoadingDevices(false);
  };

  useEffect(() => {
    if (open) {
      fetchDevices();
    }
  }, [open]);

  const handleRemoveDevice = async (deviceId: string, deviceName: string) => {
    const result = await removeDevice(deviceId);
    if (result.success) {
      toast.success(`${deviceName} has been removed`);
      fetchDevices();
    } else {
      toast.error(result.error || "Failed to remove device");
    }
  };

  const handleTrustDevice = async (deviceId: string, fingerprint: string) => {
    // The trust_device action in security-controls expects fingerprint
    const result = await trustDevice(fingerprint);
    if (result.success) {
      toast.success("Device marked as trusted");
      fetchDevices();
    } else {
      toast.error(result.error || "Failed to trust device");
    }
  };

  const getDeviceIcon = (os: string | null) => {
    if (os?.toLowerCase().includes("android") || os?.toLowerCase().includes("ios")) {
      return <Smartphone className="h-5 w-5" />;
    }
    return <Monitor className="h-5 w-5" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Trusted Devices
          </DialogTitle>
          <DialogDescription>
            Manage devices that have access to your account
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loadingDevices ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Smartphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No devices registered yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device, index) => (
                <motion.div
                  key={device.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-4 rounded-lg border ${
                    device.is_current 
                      ? "border-primary bg-primary/5" 
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        device.is_trusted ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                      }`}>
                        {getDeviceIcon(device.os)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">
                            {device.device_name}
                          </p>
                          {device.is_current && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                              This device
                            </span>
                          )}
                          {device.is_trusted && (
                            <Shield className="h-4 w-4 text-success" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {device.browser} on {device.os}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Last used {formatDistanceToNow(new Date(device.last_used_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!device.is_trusted && !device.is_current && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTrustDevice(device.id, device.device_fingerprint || device.id)}
                          disabled={loading}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      {!device.is_current && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveDevice(device.id, device.device_name)}
                          disabled={loading}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Security Tip</p>
                <p className="text-xs text-muted-foreground">
                  Remove any devices you don't recognize. Untrusted devices may require additional verification for sensitive actions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
