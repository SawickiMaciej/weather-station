"use client"; // To musi być na górze, bo używamy interakcji (klikanie)

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, CloudSun, Settings, Home } from 'lucide-react';

export default function Navbar() {
  // To jest "stan" - pamięć komponentu. 
  // false = menu zamknięte, true = menu otwarte
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="bg-slate-950 border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* LOGO (Kliknięcie przenosi na główną) */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-green-400 hover:text-green-300 transition">
            <CloudSun className="w-6 h-6" />
            <span>WeatherTech</span>
          </Link>

          {/* MENU NA KOMPUTER (Ukryte na małych ekranach: hidden md:block) */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              <Link href="/" className="text-slate-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium flex gap-2 items-center">
                <Home className="w-4 h-4" /> Pulpit
              </Link>
              <Link href="/settings" className="text-slate-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium flex gap-2 items-center">
                <Settings className="w-4 h-4" /> Ustawienia
              </Link>
            </div>
          </div>

          {/* PRZYCISK HAMBURGER (Widoczny tylko na telefonie: md:hidden) */}
          <div className="-mr-2 flex md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)} // Przełącznik: jak otwarte to zamknij, jak zamknięte to otwórz
              className="bg-slate-900 p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* ROZWIJANE MENU MOBILNE */}
      {/* Pokazuje się tylko, gdy isOpen == true */}
      {isOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link 
              href="/" 
              onClick={() => setIsOpen(false)} // Zamknij menu po kliknięciu
              className="text-slate-300 hover:text-white block px-3 py-2 rounded-md text-base font-medium"
            >
              Pulpit Główny
            </Link>
            <Link 
              href="/settings" 
              onClick={() => setIsOpen(false)}
              className="text-slate-300 hover:text-white block px-3 py-2 rounded-md text-base font-medium"
            >
              Ustawienia Stacji
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}