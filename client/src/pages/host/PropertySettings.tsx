import { useEffect, useState } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save } from "lucide-react";

export default function PropertySettings() {
  const { data: property, refetch } = trpc.property.get.useQuery();
  const updateProperty = trpc.property.update.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Settings saved");
    },
  });

  const [form, setForm] = useState({
    name: "",
    tagline: "",
    description: "",
    address: "",
    city: "",
    timezone: "America/Denver",
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    checkInTime: "15:00",
    checkOutTime: "11:00",
    nightlyRate: "",
    cleaningFee: "",
    amenities: "",
    houseRules: "",
    listingNote: "",
    mapImageUrl: "",
    mapLocationLabel: "",
    photos: "",
    seoTitle: "",
    seoDescription: "",
    seoKeywords: "",
  });

  useEffect(() => {
    if (!property) return;
    setForm({
      name: property.name ?? "",
      tagline: property.tagline ?? "",
      description: property.description ?? "",
      address: property.address ?? "",
      city: property.city ?? "",
      timezone: property.timezone ?? "America/Denver",
      maxGuests: property.maxGuests ?? 2,
      bedrooms: property.bedrooms ?? 1,
      bathrooms: property.bathrooms ?? 1,
      checkInTime: property.checkInTime ?? "15:00",
      checkOutTime: property.checkOutTime ?? "11:00",
      nightlyRate: property.nightlyRate ?? "",
      cleaningFee: property.cleaningFee ?? "",
      amenities: (property.amenities ?? []).join(", "),
      houseRules: property.houseRules ?? "",
      listingNote: property.listingNote ?? "",
      mapImageUrl: property.mapImageUrl ?? "",
      mapLocationLabel: property.mapLocationLabel ?? "",
      photos: (property.photos ?? []).join("\n"),
      seoTitle: property.seoTitle ?? "",
      seoDescription: property.seoDescription ?? "",
      seoKeywords: property.seoKeywords ?? "",
    });
  }, [property]);

  function handleSave() {
    updateProperty.mutate({
      ...form,
      amenities: form.amenities.split(",").map((item) => item.trim()).filter(Boolean),
      photos: form.photos.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    });
  }

  return (
    <HostLayout title="Property Settings">
      <div className="max-w-2xl space-y-8">
        <div className="card-premium p-6 space-y-4">
          <h2 className="font-serif text-xl">Property Details</h2>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Property Name</label>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Tagline</label>
            <Input value={form.tagline} onChange={(event) => setForm({ ...form, tagline: event.target.value })} placeholder="A short, compelling description" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Public Listing Details</label>
            <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={8} className="resize-none" placeholder="Use a blank line between paragraphs." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Address</label>
              <Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">City / Area Label</label>
              <Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Time Zone</label>
            <Input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} placeholder="America/Denver" />
          </div>
        </div>

        <div className="card-premium p-6 space-y-4">
          <h2 className="font-serif text-xl">Capacity & Times</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Max Guests</label>
              <Input type="number" min={1} value={form.maxGuests} onChange={(event) => setForm({ ...form, maxGuests: Number(event.target.value) || 1 })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Bedrooms</label>
              <Input type="number" min={0} value={form.bedrooms} onChange={(event) => setForm({ ...form, bedrooms: Number(event.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Bathrooms</label>
              <Input type="number" min={0} value={form.bathrooms} onChange={(event) => setForm({ ...form, bathrooms: Number(event.target.value) || 0 })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Check-in Time</label>
              <Input type="time" value={form.checkInTime} onChange={(event) => setForm({ ...form, checkInTime: event.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Check-out Time</label>
              <Input type="time" value={form.checkOutTime} onChange={(event) => setForm({ ...form, checkOutTime: event.target.value })} />
            </div>
          </div>
        </div>

        <div className="card-premium p-6 space-y-4">
          <h2 className="font-serif text-xl">Pricing</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Default Nightly Rate ($)</label>
              <Input type="number" step="0.01" value={form.nightlyRate} onChange={(event) => setForm({ ...form, nightlyRate: event.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Cleaning Fee ($)</label>
              <Input type="number" step="0.01" value={form.cleaningFee} onChange={(event) => setForm({ ...form, cleaningFee: event.target.value })} />
            </div>
          </div>
        </div>

        <div className="card-premium p-6 space-y-4">
          <h2 className="font-serif text-xl">Amenities, Rules & Media</h2>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Amenities</label>
            <Input value={form.amenities} onChange={(event) => setForm({ ...form, amenities: event.target.value })} placeholder="Wi-Fi, Parking, Coffee, Air Conditioning" />
            <p className="mt-1 text-xs text-muted-foreground">Separate amenities with commas.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">House Rules</label>
            <Textarea value={form.houseRules} onChange={(event) => setForm({ ...form, houseRules: event.target.value })} rows={4} className="resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Listing Note</label>
            <Textarea value={form.listingNote} onChange={(event) => setForm({ ...form, listingNote: event.target.value })} rows={3} className="resize-none" placeholder="License, occupancy, or other public note" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Photo Paths or URLs</label>
            <Textarea value={form.photos} onChange={(event) => setForm({ ...form, photos: event.target.value })} rows={8} className="font-mono text-xs resize-none" placeholder="One image path or URL per line" />
            <p className="mt-1 text-xs text-muted-foreground">Each line becomes one listing image. Store files privately or in managed media storage; do not place credentials in a URL.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Map Image Path or URL</label>
              <Input value={form.mapImageUrl} onChange={(event) => setForm({ ...form, mapImageUrl: event.target.value })} placeholder="/map-image.webp" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Map Location Label</label>
              <Input value={form.mapLocationLabel} onChange={(event) => setForm({ ...form, mapLocationLabel: event.target.value })} placeholder="Neighborhood or area" />
            </div>
          </div>
        </div>

        <div className="card-premium p-6 space-y-4">
          <h2 className="font-serif text-xl">Search & Social Preview</h2>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">SEO Title</label>
            <Input value={form.seoTitle} onChange={(event) => setForm({ ...form, seoTitle: event.target.value })} placeholder="Defaults to the property name" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">SEO Description</label>
            <Textarea value={form.seoDescription} onChange={(event) => setForm({ ...form, seoDescription: event.target.value })} rows={3} className="resize-none" placeholder="Defaults to the public listing details" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">SEO Keywords</label>
            <Textarea value={form.seoKeywords} onChange={(event) => setForm({ ...form, seoKeywords: event.target.value })} rows={4} className="resize-none" placeholder="Comma-separated keywords" />
          </div>
        </div>

        <Button onClick={handleSave} disabled={updateProperty.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {updateProperty.isPending ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </HostLayout>
  );
}
