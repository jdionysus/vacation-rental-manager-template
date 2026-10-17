import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Public
import Landing from "./pages/Landing";
import BookingConfirmation from "./pages/BookingConfirmation";

// Guest Portal
import GuestGate from "./pages/guest/GuestGate";
import GuestPortal from "./pages/guest/GuestPortal";
import GuestPage from "./pages/guest/GuestPage";

// Host Dashboard
import HostLogin from "./pages/host/HostLogin";
import Dashboard from "./pages/host/Dashboard";
import CalendarPage from "./pages/host/CalendarPage";
import ReservationsPage from "./pages/host/ReservationsPage";
import ReservationDetail from "./pages/host/ReservationDetail";
import IcalFeedsPage from "./pages/host/IcalFeedsPage";
import GuestPagesEditor from "./pages/host/GuestPagesEditor";
import TasksPage from "./pages/host/TasksPage";
import CostsPage from "./pages/host/CostsPage";
import FinancialsPage from "./pages/host/FinancialsPage";
import BookingRequestsPage from "./pages/host/BookingRequestsPage";
import TeamPage from "./pages/host/TeamPage";
import PropertySettings from "./pages/host/PropertySettings";
import PricingPage from "./pages/host/PricingPage";
import DamageChargePage from "./pages/host/DamageChargePage";
import TermsEditor from "./pages/host/TermsEditor";
import OtaLinksPage from "./pages/host/OtaLinksPage";
import QrCodePage from "./pages/host/QrCodePage";
import RateCalendarPage from "./pages/host/RateCalendarPage";
import ChecklistTemplatesPage from "./pages/host/ChecklistTemplatesPage";
import ReservationCalendarPage from "./pages/host/ReservationCalendarPage";
import IssuesPage from "./pages/host/IssuesPage";
import PrintCenterPage from "./pages/host/PrintCenterPage";
import CleaningJobsPage from "./pages/host/CleaningJobsPage";
import CleanedSchedulePage from "./pages/host/CleanedSchedulePage";
import BypassCodesPage from "./pages/host/BypassCodesPage";
import TenantGate from "./pages/tenant/TenantGate";
import TenantPortal from "./pages/tenant/TenantPortal";
import TenantPage from "./pages/tenant/TenantPage";
import TenantAutoLogin from "./pages/tenant/TenantAutoLogin";
import CohostGate from "./pages/cohost/CohostGate";
import CohostPortal from "./pages/cohost/CohostPortal";
import GuestAutoLogin from "./pages/guest/GuestAutoLogin";
import GuestWifi from "./pages/guest/GuestWifi";
import GuestbookPage from "./pages/guest/GuestbookPage";
import GuestbookAdminPage from "./pages/host/GuestbookAdminPage";
import CleanerGate from "./pages/cleaner/CleanerGate";
import CleanerPortal from "./pages/cleaner/CleanerPortal";
import InspectorGate from "./pages/inspector/InspectorGate";
import InspectorPortal from "./pages/inspector/InspectorPortal";
import WaiverFlow from "./pages/WaiverFlow";

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={Landing} />
      <Route path="/waivers" component={WaiverFlow} />
      <Route path="/booking-confirmed" component={BookingConfirmation} />

      {/* Cleaner Portal */}
      <Route path="/cleaner" component={CleanerGate} />
      <Route path="/cleaner/portal" component={CleanerPortal} />
      <Route path="/inspector" component={InspectorGate} />
      <Route path="/inspector/portal" component={InspectorPortal} />

      {/* Guest Portal */}
      <Route path="/guest/wifi" component={GuestWifi} />
      <Route path="/guest/auto" component={GuestAutoLogin} />
      <Route path="/guest" component={GuestGate} />
      <Route path="/guest/portal" component={GuestPortal} />
      <Route path="/guest/portal/:slug" component={GuestPage} />
      <Route path="/guest/guestbook" component={GuestbookPage} />

      {/* Host */}
      <Route path="/host/login" component={HostLogin} />
      <Route path="/host" component={Dashboard} />
      <Route path="/host/settings" component={PropertySettings} />
      <Route path="/host/calendar" component={CalendarPage} />
      <Route path="/host/reservations" component={ReservationsPage} />
      <Route path="/host/reservations/:id" component={ReservationDetail} />
      <Route path="/host/ical" component={IcalFeedsPage} />
      <Route path="/host/pricing" component={PricingPage} />
      <Route path="/host/guest-pages" component={GuestPagesEditor} />
      <Route path="/host/terms" component={TermsEditor} />
      <Route path="/host/tasks" component={TasksPage} />
      <Route path="/host/costs" component={CostsPage} />
      <Route path="/host/financials" component={FinancialsPage} />
      <Route path="/host/damage" component={DamageChargePage} />
      <Route path="/host/requests" component={BookingRequestsPage} />
      <Route path="/host/ota-links" component={OtaLinksPage} />
      <Route path="/host/qr-code" component={QrCodePage} />
      <Route path="/host/rates" component={RateCalendarPage} />
      <Route path="/host/checklists" component={ChecklistTemplatesPage} />
      <Route path="/host/reservation-calendar" component={ReservationCalendarPage} />
      <Route path="/host/issues" component={IssuesPage} />
      <Route path="/host/print" component={PrintCenterPage} />
      <Route path="/host/cleans" component={CleaningJobsPage} />
      <Route path="/host/cleaned" component={CleanedSchedulePage} />
      <Route path="/host/bypass-codes" component={BypassCodesPage} />
      <Route path="/host/guestbook" component={GuestbookAdminPage} />
      <Route path="/host/team" component={TeamPage} />
      <Route path="/cohost" component={CohostGate} />
      <Route path="/cohost/portal" component={CohostPortal} />
      <Route path="/tenant" component={TenantGate} />
      <Route path="/tenant/auto" component={TenantAutoLogin} />
      <Route path="/tenant/portal" component={TenantPortal} />
      <Route path="/tenant/portal/:slug" component={TenantPage} />

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
