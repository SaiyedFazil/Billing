"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  thumbnailUrl,
  UPLOAD_ENDPOINT,
} from "@/lib/storage";
import { getUploadTokenAction } from "@/server/items/upload-token-action";

export function ItemImageUploader({
  imageUrl,
  onChange,
  disabled,
}: {
  imageUrl: string | null;
  onChange: (next: {
    imageUrl: string | null;
    imageFileId: string | null;
  }) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFile(file: File) {
    if (
      !ALLOWED_IMAGE_TYPES.includes(
        file.type as (typeof ALLOWED_IMAGE_TYPES)[number],
      )
    ) {
      toast.error("Use a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }

    setIsUploading(true);
    try {
      const auth = await getUploadTokenAction();
      if (!auth.ok) {
        toast.error(auth.error.message);
        return;
      }

      const body = new FormData();
      body.append("file", file);
      body.append("fileName", file.name);
      body.append("publicKey", auth.data.publicKey);
      body.append("signature", auth.data.signature);
      body.append("expire", String(auth.data.expire));
      body.append("token", auth.data.token);
      body.append("folder", "/billing/items");
      body.append("useUniqueFileName", "true");

      // Straight to ImageKit — never through a Netlify function.
      const response = await fetch(UPLOAD_ENDPOINT, { method: "POST", body });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const uploaded = (await response.json()) as {
        url: string;
        fileId: string;
      };
      onChange({ imageUrl: uploaded.url, imageFileId: uploaded.fileId });
      toast.success("Image uploaded");
    } catch (error) {
      console.error("Image upload failed", error);
      toast.error("Image upload failed. Try again.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="bg-muted/60 relative size-20 shrink-0 overflow-hidden rounded-2xl border border-dashed">
        {imageUrl ? (
          <Image
            src={thumbnailUrl(imageUrl, 160)}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center">
            <ImagePlus className="size-5" />
          </div>
        )}
        {isUploading ? (
          <div className="bg-background/70 absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col items-start gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isUploading}
          onClick={() => inputRef.current?.click()}
        >
          {imageUrl ? "Replace image" : "Upload image"}
        </Button>
        {imageUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || isUploading}
            onClick={() => onChange({ imageUrl: null, imageFileId: null })}
          >
            <X className="size-3" />
            Remove
          </Button>
        ) : null}
        <p className="text-muted-foreground text-xs">
          JPG, PNG or WebP. Max 5 MB.
        </p>
      </div>
    </div>
  );
}
