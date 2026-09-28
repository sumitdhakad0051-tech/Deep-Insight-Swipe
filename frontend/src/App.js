import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Landing from "@/pages/Landing";
import Directions from "@/pages/Directions";
import Loading from "@/pages/Loading";
import Feed from "@/pages/Feed";
import Saved from "@/pages/Saved";
import MyInterests from "@/pages/MyInterests";
import Admin from "@/pages/Admin";
import InstallPrompt from "@/components/InstallPrompt";

function App() {
  return (
    <div className="App min-h-[100dvh] bg-[#0C0C0D] text-[#F8F8F8]">
      <BrowserRouter>
        <InstallPrompt />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/directions" element={<Directions />} />
          <Route path="/loading" element={<Loading />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/saved" element={<Saved />} />
          <Route path="/my-interests" element={<MyInterests />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        theme="dark"
        position="bottom-center"
        toastOptions={{
          style: {
            background: "#121214",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#F8F8F8",
            fontFamily: "Manrope, sans-serif",
          },
        }}
      />
    </div>
  );
}

export default App;
