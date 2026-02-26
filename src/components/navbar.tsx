"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, Leaf, Settings, Home, LogOut } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  // Inicjalizacja klienta Supabase do wylogowania
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login'; // Wyrzucamy na ekran logowania
  };

  return (
    <nav className="bg-slate-950 border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* LOGO */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-emerald-500 hover:text-emerald-400 transition">
            <Leaf className="w-6 h-6" />
            <span>AgroTech</span>
          </Link>

          {/* MENU NA KOMPUTER */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-center space-x-4">
              <Link href="/" className="text-slate-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium flex gap-2 items-center transition-colors">
                <Home className="w-4 h-4" /> Pulpit
              </Link>
              <Link href="/settings" className="text-slate-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium flex gap-2 items-center transition-colors">
                <Settings className="w-4 h-4" /> Ustawienia
              </Link>
              
              {/* Przycisk Wyloguj (PC) */}
              <button 
                onClick={handleLogout}
                className="ml-4 text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded-md text-sm font-medium flex gap-2 items-center transition-colors border border-transparent hover:border-red-500/30"
              >
                <LogOut className="w-4 h-4" /> Wyloguj
              </button>
            </div>
          </div>

          {/* PRZYCISK HAMBURGER (Telefon) */}
          <div className="-mr-2 flex md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="bg-slate-900 p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* ROZWIJANE MENU MOBILNE */}
      {isOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link href="/" onClick={() => setIsOpen(false)} className="text-slate-300 hover:text-white flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium">
              <Home className="w-5 h-5" /> Pulpit Główny
            </Link>
            <Link href="/settings" onClick={() => setIsOpen(false)} className="text-slate-300 hover:text-white flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium">
              <Settings className="w-5 h-5" /> Ustawienia Stacji
            </Link>
            
            {/* Przycisk Wyloguj (Mobile) */}
            <button 
              onClick={handleLogout}
              className="w-full text-left text-red-400 hover:text-red-300 flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium mt-2 border-t border-slate-800 pt-3"
            >
              <LogOut className="w-5 h-5" /> Wyloguj się
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}