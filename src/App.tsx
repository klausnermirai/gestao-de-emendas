/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, ReactNode, useEffect } from 'react';
import { 
  BarChart3, 
  Calendar, 
  ChevronRight, 
  CircleAlert, 
  CircleCheck, 
  Download, 
  Filter, 
  Info, 
  LayoutDashboard, 
  LogOut,
  MoreVertical, 
  Search,
  Settings,
  ShieldCheck,
  User,
  UserPlus,
  Trash2,
  Wallet,
  Database,
  X,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CATEGORIES, GRANTS, MONTHS, Grant, Category } from './data';
import { db, auth } from './firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy
} from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';

export default function App() {
  const [categories, setCategories] = useState<Category[]>(CATEGORIES);
  const [grants, setGrants] = useState<Grant[]>(GRANTS);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrant, setSelectedGrant] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'analysis' | 'categories' | 'settings' | 'grants'>('dashboard');
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [detailsGrantId, setDetailsGrantId] = useState<string | null>(null);
  const [editingGrantId, setEditingGrantId] = useState<string | null>(null);
  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>([]);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatValue, setNewCatValue] = useState('');
  const [newGrant, setNewGrant] = useState<Partial<Grant>>({
    type: 'Emenda parlamentar',
    nature: 'Custeio',
    accountability: 'Direta com o município',
    status: 'Oficiada',
    startMonth: 0,
    periodMonths: 12,
    allocations: [],
    color: '#3b82f6',
    totalValue: 0,
    name: ''
  });

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Check authorization
        if (u.email === 'kwarizaya@gmail.com') {
          setIsAuthorized(true);
        } else {
          // Check whitelist
          onSnapshot(doc(db, 'authorized_users', u.email!), (snap) => {
            setIsAuthorized(snap.exists());
          });
        }
      } else {
        setIsAuthorized(false);
      }
      setAuthLoading(false);
    });
  }, []);

  // Sync Whitelist
  useEffect(() => {
    if (!user || !isAuthorized) return;
    return onSnapshot(collection(db, 'authorized_users'), (snapshot) => {
      setAuthorizedEmails(snapshot.docs.map(doc => doc.id));
    });
  }, [user, isAuthorized]);

  // Sync Categories from Firestore
  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('name'));
    return onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        const fetched = snapshot.docs.map(doc => doc.data() as Category);
        setCategories(fetched);
      } else if (isAuthorized && user?.email === 'kwarizaya@gmail.com') {
        // Bootstrap initial categories for admin if Firestore is empty
        for (const cat of CATEGORIES) {
          await setDoc(doc(db, 'categories', cat.id), cat);
        }
      }
    });
  }, [isAuthorized, user]);

  // Sync Grants from Firestore
  useEffect(() => {
    const q = collection(db, 'grants');
    return onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        const fetched = snapshot.docs.map(doc => doc.data() as Grant);
        setGrants(fetched);
      } else if (isAuthorized && user?.email === 'kwarizaya@gmail.com') {
        // Bootstrap initial grants for admin if Firestore is empty
        for (const grant of GRANTS) {
          await setDoc(doc(db, 'grants', grant.id), grant);
        }
      }
    });
  }, [isAuthorized, user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleAddEmail = async () => {
    if (!newEmail.includes('@')) return;
    try {
      await setDoc(doc(db, 'authorized_users', newEmail.toLowerCase().trim()), {
        addedAt: new Date().toISOString(),
        addedBy: user?.email
      });
      setNewEmail('');
    } catch (error) {
      console.error("Erro ao adicionar e-mail", error);
    }
  };

  const handleRemoveEmail = async (email: string) => {
    if (email === user?.email || email === 'kwarizaya@gmail.com') return;
    try {
      await deleteDoc(doc(db, 'authorized_users', email));
    } catch (error) {
      console.error("Erro ao remover e-mail", error);
    }
  };

  const filteredCategories = categories.filter(cat => 
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getGrantsForCategoryAndMonth = (catId: string, monthIdx: number) => {
    return grants.filter(grant => 
      (grant.allocations || []).some(a => a.categoryId === catId && a.amount > 0) && 
      monthIdx >= grant.startMonth && 
      monthIdx < grant.startMonth + grant.periodMonths
    );
  };

  const totalMonthlyExpense = categories.reduce((acc, cat) => acc + cat.monthlyAverage, 0);
  
  // Analysis Logic: Sequential Coverage
  const analysis = React.useMemo(() => {
    const monthlyGaps: Record<string, number[]> = {};
    const categoryStatus: Record<string, { totalGap: number, totalAnnualCost: number, totalAllocatedRaw: number, monthsUncovered: number[] }> = {};

    // Initialize gaps
    categories.forEach(cat => {
      monthlyGaps[cat.id] = new Array(12).fill(cat.monthlyAverage);
      categoryStatus[cat.id] = { 
        totalGap: 0, 
        totalAnnualCost: cat.monthlyAverage * 12,
        totalAllocatedRaw: 0,
        monthsUncovered: [] 
      };
    });

    // Calculate Raw Totals First (Simple Sum)
    grants.forEach(grant => {
      (grant.allocations || []).forEach(alloc => {
        if (categoryStatus[alloc.categoryId]) {
          categoryStatus[alloc.categoryId].totalAllocatedRaw += alloc.amount;
        }
      });
    });

    // Apply allocations from confirmed grants (Time-Aware Logic for REAL Gap)
    grants.forEach(grant => {
      (grant.allocations || []).forEach(alloc => {
        if (!monthlyGaps[alloc.categoryId]) return;
        
        let remaining = alloc.amount;
        const start = grant.startMonth;
        const end = Math.min(12, grant.startMonth + grant.periodMonths);

        // Distribute grant money across its validity months
        for (let m = start; m < end && remaining > 0; m++) {
          const gap = monthlyGaps[alloc.categoryId][m];
          const deduct = Math.min(remaining, gap);
          monthlyGaps[alloc.categoryId][m] -= deduct;
          remaining -= deduct;
        }
      });
    });

    // Calculate final status
    categories.forEach(cat => {
      const status = categoryStatus[cat.id];
      // The total gap is now a simple net annual balance (Annual Cost - Total Destined)
      // This matches the user's expectation of "Net Need" for new capturing
      status.totalGap = Math.max(0, status.totalAnnualCost - status.totalAllocatedRaw);
      
      // Keep temporal analysis for "Months Uncovered"
      monthlyGaps[cat.id].forEach((gap, mIdx) => {
        if (gap > 0) {
          status.monthsUncovered.push(mIdx);
        }
      });
    });

    const sortedGaps = Object.entries(categoryStatus)
      .map(([id, data]) => ({
        id,
        name: categories.find(c => c.id === id)?.name || '',
        ...data
      }))
      .sort((a, b) => b.totalGap - a.totalGap);

    const totalNeeded = sortedGaps.reduce((acc, g) => acc + g.totalGap, 0);

    return { sortedGaps, totalNeeded, monthlyGaps };
  }, [categories, grants]);

  // Calculate coverage for a month
  const getMonthlyCoverage = (monthIdx: number) => {
    let coveredCount = 0;
    categories.forEach(cat => {
      if (getGrantsForCategoryAndMonth(cat.id, monthIdx).length > 0) {
        coveredCount++;
      }
    });
    return (coveredCount / categories.length) * 100;
  };

  const updateCategory = async (id: string, field: keyof Category, value: string | number) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'categories', id), { [field]: value });
    } catch (error) {
      console.error("Update failed", error);
    }
  };

  const handleAddCategory = async (name: string, monthlyAverage: number) => {
    if (!user) return;
    if (!name || monthlyAverage < 0) return;
    
    try {
      const id = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();
      const newCat = { id, name, monthlyAverage };
      await setDoc(doc(db, 'categories', id), newCat);
    } catch (error) {
      console.error("Erro ao adicionar categoria:", error);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!user) return;
    if (!confirm("Tem certeza que deseja excluir esta categoria? Isso pode afetar as análises se houver emendas alocadas nela.")) return;
    
    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (error) {
      console.error("Erro ao excluir categoria:", error);
    }
  };

  const handleSaveGrant = async () => {
    if (!user) {
      alert("Por favor, faça login para cadastrar emendas.");
      return;
    }
    if (!newGrant.name || (newGrant.totalValue || 0) <= 0 || (newGrant.allocations || []).length === 0) {
      alert("Por favor, preencha todos os campos obrigatórios e defina o plano de aplicação.");
      return;
    }

    try {
      const grantId = editingGrantId || `grant_${Date.now()}`;
      const grantData: Grant = {
        id: grantId,
        name: newGrant.name!,
        color: newGrant.color || '#3b82f6',
        totalValue: newGrant.totalValue!,
        periodMonths: newGrant.periodMonths!,
        startMonth: newGrant.startMonth!,
        allocations: newGrant.allocations!,
        type: newGrant.type as any,
        nature: newGrant.nature as any,
        accountability: newGrant.accountability as any,
        status: newGrant.status as any,
      };

      await setDoc(doc(db, 'grants', grantId), grantData);
      setIsGrantModalOpen(false);
      setEditingGrantId(null);
      setNewGrant({
        type: 'Emenda parlamentar',
        nature: 'Custeio',
        accountability: 'Direta com o município',
        status: 'Oficiada',
        startMonth: 0,
        periodMonths: 12,
        allocations: [],
        color: '#3b82f6',
        totalValue: 0,
        name: ''
      });
    } catch (error) {
      console.error("Erro ao salvar emenda:", error);
      alert("Erro ao salvar emenda. Verifique as permissões.");
    }
  };

  const handleEditGrant = (grant: Grant) => {
    setEditingGrantId(grant.id);
    setNewGrant(grant);
    setIsGrantModalOpen(true);
  };

  const handleDeleteGrant = async (grantId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta emenda?")) return;
    try {
      await deleteDoc(doc(db, 'grants', grantId));
    } catch (error) {
      console.error("Erro ao excluir emenda:", error);
    }
  };

  const handleResetToOfficialData = async () => {
    if (!user || user.email !== 'kwarizaya@gmail.com') return;
    if (!confirm("Isso apagará todas as emendas e categorias atuais para carregar os dados oficiais do PDF. Continuar?")) return;

    try {
      const batch = writeBatch(db);

      // Clear existing
      categories.forEach(cat => {
        batch.delete(doc(db, 'categories', cat.id));
      });
      grants.forEach(g => {
        batch.delete(doc(db, 'grants', g.id));
      });

      // Bootstrap new
      CATEGORIES.forEach(cat => {
        batch.set(doc(db, 'categories', cat.id), cat);
      });
      GRANTS.forEach(g => {
        batch.set(doc(db, 'grants', g.id), g);
      });
      
      await batch.commit();
      alert("Dados oficiais carregados com sucesso!");
    } catch (error) {
      console.error("Erro ao resetar dados:", error);
      alert(`Erro ao resetar dados: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Lar São Vicente', 15, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('RELATÓRIO DE ANÁLISE DE GAPS E CAPTAÇÃO', 15, 30);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - 50, 30);

    // Summary Cards
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.text('Resumo Financeiro (12 Meses)', 15, 55);
    
    autoTable(doc, {
      startY: 60,
      head: [['Potencial Total de Captação', 'Gasto Mensal Médio Total']],
      body: [[
        analysis.totalNeeded.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        totalMonthlyExpense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      ]],
      theme: 'plain',
      headStyles: { fillColor: [241, 245, 249], textColor: [100, 116, 139], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 14, fontStyle: 'bold', textColor: [37, 99, 235] }
    });

    // Main Table
    doc.text('Prioridades e Lacunas por Categoria', 15, (doc as any).lastAutoTable.finalY + 20);
    
    const tableData = analysis.sortedGaps.map((gap, idx) => [
      idx + 1,
      gap.name,
      gap.totalAnnualCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      gap.totalAllocatedRaw.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      gap.totalGap.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      `${gap.monthsUncovered.length} meses`
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 25,
      head: [['#', 'Categoria', 'Custo 12 Meses', 'Já Destinado', 'Disponível', 'Meses em Aberto']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' },
        5: { halign: 'center' }
      }
    });

    doc.save('relatorio-analise-gaps-lar-sao-vicente.pdf');
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] text-slate-900 font-sans selection:bg-blue-100">
      {/* Landing Login Screen */}
      <AnimatePresence mode="wait">
        {!isAuthorized && !authLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-slate-900 flex items-center justify-center p-6"
          >
            <div className="absolute inset-0 overflow-hidden opacity-20">
              <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-600 blur-[120px] rounded-full" />
              <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-indigo-600 blur-[120px] rounded-full" />
            </div>

            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="relative w-full max-w-md bg-white p-10 rounded-[40px] shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-blue-500/30 mx-auto mb-8">
                <BarChart3 size={40} />
              </div>
              <h1 className="text-3xl font-black text-slate-800 mb-2">Lar São Vicente</h1>
              <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px] mb-8">Gestão de Emendas</p>
              
              {!user ? (
                <div className="space-y-4">
                  <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                    Bem-vindo ao sistema de planejamento. Por favor, identifique-se para acessar os dados.
                  </p>
                  <button 
                    onClick={handleLogin}
                    className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all group"
                  >
                    <User size={20} className="group-hover:scale-110 transition-transform" />
                    Entrar com Google
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-6 bg-red-50 rounded-3xl border border-red-100">
                    <ShieldCheck size={32} className="text-red-500 mx-auto mb-3" />
                    <h3 className="text-red-900 font-bold text-sm mb-1">Acesso Não Autorizado</h3>
                    <p className="text-red-700 text-xs leading-relaxed">
                      O e-mail <strong>{user.email}</strong> não possui permissão para acessar este sistema. Solicite acesso ao administrador.
                    </p>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 mx-auto"
                  >
                    <LogOut size={14} /> Sair da Conta
                  </button>
                </div>
              )}
              
              <div className="mt-12 flex items-center justify-center gap-2 text-slate-300">
                <div className="w-1 h-1 rounded-full bg-current" />
                <div className="w-1 h-1 rounded-full bg-current" />
                <div className="w-1 h-1 rounded-full bg-current" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar / Sidebar Navigation */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 z-50 hidden lg:block">
        <div className="p-6 h-full flex flex-col">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <BarChart3 size={24} />
            </div>
            <div>
              <h1 className="font-bold text-slate-800 leading-tight">Lar São Vicente</h1>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Gestão de Emendas</p>
            </div>
          </div>

          <nav className="space-y-1">
            <NavItem 
              icon={<LayoutDashboard size={18} />} 
              label="Dashboard" 
              active={activeView === 'dashboard'} 
              onClick={() => setActiveView('dashboard')}
            />
            <NavItem 
              icon={<Search size={18} />} 
              label="Análise de Gaps" 
              active={activeView === 'analysis'}
              onClick={() => setActiveView('analysis')}
            />
            <NavItem 
              icon={<Wallet size={18} />} 
              label="Gerenciar Emendas" 
              active={activeView === 'grants'}
              onClick={() => setActiveView('grants')}
            />
            <NavItem 
              icon={<Settings size={18} />} 
              label="Gerenciar Categorias" 
              active={activeView === 'categories'}
              onClick={() => setActiveView('categories')}
            />
            {user && isAuthorized && (
              <NavItem 
                icon={<ShieldCheck size={18} />} 
                label="Configurações" 
                active={activeView === 'settings'}
                onClick={() => setActiveView('settings')}
              />
            )}
          </nav>

          <div className="mt-10 overflow-hidden flex-1 flex flex-col">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 px-3 flex-shrink-0">Painel de Emendas</h3>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
              {grants.length === 0 && (
                <div className="px-3 py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Nenhuma Emenda</p>
                </div>
              )}
              {grants.map(grant => (
                <button 
                  key={grant.id}
                  onClick={() => setSelectedGrant(selectedGrant === grant.id ? null : grant.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left group/btn ${
                    selectedGrant === grant.id 
                    ? 'bg-blue-50 ring-1 ring-blue-100 shadow-sm' 
                    : 'hover:bg-slate-50 border border-transparent hover:border-slate-100'
                  }`}
                >
                  <div className="relative">
                    <div className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm transition-transform group-hover/btn:scale-110" style={{ backgroundColor: grant.color }}></div>
                    {grant.status === 'Paga' && (
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 border-2 border-white rounded-full"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold truncate transition-colors ${
                      selectedGrant === grant.id ? 'text-blue-700' : 'text-slate-600'
                    }`}>{grant.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className={`w-1 h-1 rounded-full ${
                        grant.status === 'Paga' ? 'bg-emerald-500' :
                        grant.status === 'Em Elaboração' ? 'bg-blue-500' :
                        'bg-amber-500'
                      }`} />
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">{grant.status}</span>
                    </div>
                  </div>
                  <ChevronRight size={12} className={`transition-all ${
                    selectedGrant === grant.id ? 'text-blue-400 translate-x-0' : 'text-slate-200 -translate-x-2 opacity-0'
                  }`} />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-slate-100 px-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                  <User size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-800 truncate">{user.displayName || 'Usuário'}</p>
                  <button onClick={handleLogout} className="text-[9px] text-slate-400 hover:text-red-500 flex items-center gap-1 font-bold uppercase tracking-widest transition-colors">
                    <LogOut size={8} /> Sair
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
              >
                <User size={14} /> Entrar com Google
              </button>
            )}
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 mt-6">
            <div className="flex items-center gap-2 mb-2 text-blue-600">
              <Info size={14} />
              <span className="text-[10px] font-bold uppercase">Status Abril/26</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">Cobertura atual das despesas planejadas.</p>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-1000" 
                style={{ width: `${getMonthlyCoverage(0).toFixed(0)}%` }}
              ></div>
            </div>
            <p className="text-right text-[10px] font-bold text-slate-700 mt-1">{getMonthlyCoverage(0).toFixed(0)}% Coberto</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 lg:p-8">
        {activeView === 'dashboard' ? (
          <>
            {/* Header Section */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Planejamento de Emendas</h2>
                <p className="text-slate-500 text-sm">Visualize a destinação das subvenções em cada categoria de gasto.</p>
              </div>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm text-slate-600">
                  <Download size={16} /> Exportar PDF
                </button>
                <button 
                  onClick={() => setIsGrantModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                >
                  Nova Emenda
                </button>
              </div>
            </header>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <StatCard 
                title="Total Despesa Mensal" 
                value={totalMonthlyExpense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} 
                trend="+2.4%" 
                icon={<Wallet className="text-blue-500" />}
              />
              <StatCard 
                title="Categorias Gerenciadas" 
                value={`${new Set(grants.flatMap(g => (g.allocations || []).map(a => a.categoryId))).size}`} 
                trend="Ativa" 
                icon={<CircleCheck className="text-emerald-500" />}
              />
              <StatCard 
                title="Categorias em Aberto" 
                value={`${categories.length - new Set(grants.flatMap(g => (g.allocations || []).map(a => a.categoryId))).size}`} 
                trend="Atenção" 
                icon={<CircleAlert className="text-amber-500" />}
              />
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-12">
              {/* Table Toolbar */}
              <div className="p-6 border-bottom border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Buscar categoria..." 
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors">
                    <Filter size={18} />
                  </button>
                  <div className="h-6 w-px bg-slate-200 mx-1"></div>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button className="px-4 py-1.5 text-xs font-bold bg-white rounded-lg shadow-sm text-slate-800">Timeline</button>
                    <button className="px-4 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600">Lista</button>
                  </div>
                </div>
              </div>

              {/* Planning Grid */}
              <div className="overflow-x-auto">
                <div className="min-w-[1200px]">
                  {/* Grid Header */}
                  <div className="grid grid-cols-[280px_1fr] bg-slate-50 border-y border-slate-200">
                    <div className="p-4 border-r border-slate-200 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categoria de Gasto</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Média R$</span>
                    </div>
                    <div className="grid grid-cols-12 divide-x divide-slate-200">
                      {MONTHS.map(month => (
                        <div key={month} className="p-4 text-center">
                          <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tighter">{month}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Grid Body */}
                  <div className="divide-y divide-slate-100">
                    <AnimatePresence>
                      {filteredCategories.map((cat, idx) => (
                        <motion.div 
                          key={cat.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className="grid grid-cols-[280px_1fr] hover:bg-slate-50/50 transition-colors group"
                        >
                          <div className="p-4 border-r border-slate-200 flex items-center justify-between group-hover:bg-slate-50 transition-colors relative group/row">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-700">{cat.name}</span>
                                <div className="relative group/info">
                                  <Info size={12} className="text-slate-300 hover:text-blue-500 cursor-help transition-colors" />
                                  <div className="absolute left-0 bottom-full mb-2 w-48 bg-slate-900 text-white p-3 rounded-xl shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50 pointer-events-none">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 border-b border-white/10 pb-1">Resumo Anual</p>
                                    <div className="space-y-1.5">
                                      <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-slate-400">Total (12m):</span>
                                        <span className="font-bold">{(cat.monthlyAverage * 12).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-slate-400">Já Alocado:</span>
                                        <span className="font-bold text-emerald-400">
                                          {((12 - (analysis.sortedGaps.find(g => g.id === cat.id)?.monthsUncovered.length || 0)) * cat.monthlyAverage).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-slate-400">Valor Livre:</span>
                                        <span className="font-bold text-amber-400">
                                          {(analysis.sortedGaps.find(g => g.id === cat.id)?.totalGap || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-white/10 flex justify-between items-center text-[9px] font-bold uppercase tracking-tighter">
                                      <span className="text-slate-500">Cobertura:</span>
                                      <span className="text-blue-400">
                                        {(100 - ((analysis.sortedGaps.find(g => g.id === cat.id)?.monthsUncovered.length || 0) / 12 * 100)).toFixed(0)}%
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <span className="text-[10px] text-slate-400 font-medium tracking-wide">Despesa Operacional</span>
                            </div>
                            <span className="text-[11px] font-mono font-medium text-slate-500">
                              {cat.monthlyAverage.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-12 divide-x divide-slate-100 relative">
                            {MONTHS.map((_, mIdx) => {
                              const grantsActive = getGrantsForCategoryAndMonth(cat.id, mIdx);
                              const hasGrant = grantsActive.length > 0;

                              return (
                                <div key={mIdx} className="h-16 flex items-center justify-center p-1 relative min-w-[140px]">
                                  {hasGrant ? (
                                    <div className="flex flex-col gap-0.5 w-full">
                                      {grantsActive.map(g => (
                                        <motion.div 
                                          key={g.id}
                                          layoutId={`grant-${g.id}-${cat.id}-${mIdx}`}
                                          className={`h-4 w-full rounded-sm opacity-90 relative cursor-pointer group/pill transition-all ${
                                            g.status !== 'Paga' ? 'border-2 border-dashed border-white/40' : ''
                                          } ${
                                            selectedGrant && g.id !== selectedGrant ? 'opacity-20 translate-y-1' : 'hover:opacity-100 z-10'
                                          }`}
                                          style={{ backgroundColor: g.color }}
                                          title={`${g.name} (${g.status})`}
                                        >
                                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/pill:opacity-100 transition-opacity pointer-events-none">
                                            <div className="bg-slate-900 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-xl whitespace-nowrap -translate-y-6">
                                              {g.name} • {g.status}
                                            </div>
                                          </div>
                                        </motion.div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="w-2 h-2 rounded-full bg-slate-100"></div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Footer Info */}
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-200"></div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Livre</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Coberto</span>
                  </div>
                </div>
                <div className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                  Atualizado em Abril de 2026
                </div>
              </div>
            </div>
          </>
        ) : activeView === 'analysis' ? (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-4xl"
          >
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Análise para Próxima Emenda</h2>
                <p className="text-slate-500 text-sm">Identificamos as categorias com maiores lacunas de financiamento para os próximos 12 meses.</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleExportPDF}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm group"
                >
                  <Download size={14} className="text-slate-400 group-hover:text-blue-500 transition-colors" /> Exportar PDF
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Wallet size={120} />
                </div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Potencial de Captação (12 meses)</h4>
                <p className="text-4xl font-black text-blue-600 mb-4">
                  {analysis.totalNeeded.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Este é o valor total necessário para cobrir 100% das categorias que atualmente não possuem nenhuma emenda vinculada em algum período do ano.
                </p>
              </div>

              <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl relative overflow-hidden">
                <div className="flex items-center gap-2 mb-6 text-blue-400">
                  <Info size={16} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Recomendação Estratégica</span>
                </div>
                <p className="text-sm font-medium leading-relaxed mb-6">
                  Focar em <span className="text-blue-400 font-bold">Manutenção e Insumos Operacionais</span>. Estas categorias apresentam gastos constantes e recorrentes que, se cobertos por emenda, liberariam recursos próprios para investimentos em infraestrutura.
                </p>
                <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white">
                    <BarChart3 size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sugestão de Valor</p>
                    <p className="text-lg font-black text-white">R$ 150.000,00</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Prioridades por Valor de Gasto (Gaps)</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {analysis.sortedGaps.map((gap, idx) => (
                  <div key={gap.id} className="p-8 hover:bg-slate-50 transition-all group">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-start gap-5">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 font-black text-lg shadow-inner">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-base font-black text-slate-800 uppercase tracking-tight">{gap.name}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1">
                              <Calendar size={10} /> {gap.monthsUncovered.length} Meses descobertos
                            </p>
                            {gap.totalAllocatedRaw > gap.totalAnnualCost && (
                              <span className="text-[9px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">
                                Alocação excedente
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-8 items-center">
                        <div className="text-right border-r border-slate-100 pr-8">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Custo 12 Meses</p>
                          <p className="text-sm font-bold text-slate-600 tabular-nums">
                            {gap.totalAnnualCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        </div>
                        <div className="text-right border-r border-slate-100 pr-8">
                          <p className="text-[9px] font-bold text-blue-400 uppercase tracking-[0.2em] mb-1">Já Destinado</p>
                          <p className="text-sm font-bold text-blue-600 tabular-nums">
                            {gap.totalAllocatedRaw.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        </div>
                        <div className="text-right col-span-2 lg:col-span-1">
                          <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-[0.2em] mb-1">Disponível para Destinar</p>
                          <p className="text-lg font-black text-emerald-600 tabular-nums">
                            {gap.totalGap.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ) : activeView === 'grants' ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-6xl"
          >
            <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Gerenciamento de Emendas</h2>
                <p className="text-slate-500 text-sm">Visualize o status, edite valores e acompanhe o ciclo de vida de cada emenda.</p>
              </div>
              <button 
                onClick={() => {
                  setEditingGrantId(null);
                  setNewGrant({
                    type: 'Emenda parlamentar',
                    nature: 'Custeio',
                    accountability: 'Direta com o município',
                    status: 'Oficiada',
                    startMonth: 0,
                    periodMonths: 12,
                    allocations: [],
                    color: '#3b82f6',
                    totalValue: 0,
                    name: ''
                  });
                  setIsGrantModalOpen(true);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 rounded-2xl text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
              >
                <Plus size={18} /> Cadastrar Nova Emenda
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {grants.map(grant => (
                <div key={grant.id} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-xl hover:border-blue-100 transition-all duration-300">
                  <div className="p-6 relative">
                    <div className="absolute top-0 right-0 p-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEditGrant(grant)}
                        className="p-2 bg-white rounded-lg shadow-sm border border-slate-100 text-slate-400 hover:text-blue-500 transition-all"
                        title="Editar"
                      >
                        <Settings size={14} />
                      </button>
                      <button 
                         onClick={() => handleDeleteGrant(grant.id)}
                         className="p-2 bg-white rounded-lg shadow-sm border border-slate-100 text-slate-400 hover:text-red-500 transition-all"
                         title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: grant.color }} />
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${
                        grant.status === 'Paga' ? 'bg-emerald-50 text-emerald-600' :
                        grant.status === 'Em Elaboração' ? 'bg-blue-50 text-blue-600' :
                        'bg-amber-50 text-amber-600'
                      }`}>
                        {grant.status}
                      </span>
                    </div>
                    <h3 className="font-black text-slate-800 mb-1 leading-tight">{grant.name}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{grant.type}</p>
                  </div>
                  
                  <div className="px-6 py-4 bg-slate-50 border-y border-slate-100 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">Valor Total</p>
                      <p className="text-sm font-black text-slate-800 tabular-nums">
                        {grant.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">Vigência</p>
                      <p className="text-sm font-black text-slate-800 uppercase tracking-tighter">
                        {grant.periodMonths} meses
                      </p>
                    </div>
                  </div>

                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                        <Wallet size={12} className="text-slate-300" />
                        <span>{grant.nature}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                        <Info size={12} className="text-slate-300" />
                        <span className="truncate">{grant.accountability}</span>
                      </div>
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Plano de Aplicação ({(grant.allocations || []).length})</p>
                        <button 
                          onClick={() => setDetailsGrantId(grant.id)}
                          className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 transition-colors"
                        >
                          Ver Plano Completo
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(grant.allocations || []).slice(0, 2).map(alloc => (
                          <div key={alloc.categoryId} className="flex items-center justify-between bg-slate-100/50 p-2 rounded-xl">
                            <span className="text-[8px] font-bold text-slate-500 uppercase truncate max-w-[120px]">
                              {categories.find(c => c.id === alloc.categoryId)?.name || alloc.categoryId}
                            </span>
                            <span className="text-[9px] font-black text-slate-700 tabular-nums">
                              {alloc.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                        ))}
                        {(grant.allocations || []).length > 2 && (
                          <p className="text-[8px] font-bold text-slate-400 text-center uppercase tracking-widest">
                            + {(grant.allocations || []).length - 2} outras categorias
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : activeView === 'settings' ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl"
          >
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-800">Configurações de Acesso</h2>
              <p className="text-slate-500 text-sm">Gerencie quem pode visualizar e editar o sistema de emendas.</p>
            </div>

            <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden p-10">
              <div className="flex items-start gap-8 flex-col md:flex-row">
                <div className="flex-1 w-full space-y-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Adicionar Novo E-mail</label>
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                          type="email"
                          placeholder="exemplo@gmail.com"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                          className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        />
                      </div>
                      <button 
                        onClick={handleAddEmail}
                        className="px-8 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2"
                      >
                        Autorizar
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">E-mails Autorizados ({authorizedEmails.length + 1})</label>
                    <div className="bg-slate-50 rounded-[32px] border border-slate-100 p-4 space-y-2 max-h-[400px] overflow-y-auto">
                      {/* Master Admin - Always present in UI for safety */}
                      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                            <ShieldCheck size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800">kwarizaya@gmail.com</p>
                            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Administrador Master</p>
                          </div>
                        </div>
                      </div>

                      {authorizedEmails.map(email => (
                        <div key={email} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all group">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                              <User size={20} />
                            </div>
                            <p className="text-sm font-bold text-slate-700">{email}</p>
                          </div>
                          <button 
                            onClick={() => handleRemoveEmail(email)}
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Remover acesso"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="w-full md:w-72 space-y-6">
                  <div className="p-8 bg-blue-600 rounded-[32px] text-white shadow-xl shadow-blue-200">
                    <h4 className="text-lg font-bold mb-4">Segurança de Dados</h4>
                    <p className="text-xs text-blue-100 leading-relaxed mb-6 font-medium">
                      Somente e-mails nesta lista poderão ultrapassar a tela de login inicial e interagir com o sistema.
                    </p>
                    <div className="p-4 bg-white/10 rounded-2xl border border-white/10 flex items-center gap-3">
                      <ShieldCheck size={20} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Ativo e Protegido</span>
                    </div>
                  </div>

                  <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-100">
                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">DICA</h5>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium mb-6">
                      Ao remover um e-mail, o usuário perderá o acesso instantaneamente na próxima tentativa de login.
                    </p>
                    
                    {user?.email === 'kwarizaya@gmail.com' && (
                      <div className="pt-6 border-t border-slate-200">
                        <button 
                          onClick={handleResetToOfficialData}
                          className="w-full py-3 bg-white border border-red-100 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all flex items-center justify-center gap-2"
                        >
                          <Database size={14} /> Reiniciar Dados (Padrão PDF)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl"
          >
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Gerenciamento de Categorias</h2>
                <p className="text-slate-500 text-sm">Ajuste os nomes e os valores das médias mensais para refletir a realidade do Lar.</p>
              </div>
            </div>

            {user && (
              <div className="mb-6 p-6 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">Nova Categoria</p>
                  <input 
                    type="text" 
                    placeholder="Ex: Novos Equipamentos"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
                <div className="w-48">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">Média Mensal (R$)</p>
                  <input 
                    type="number" 
                    placeholder="0,00"
                    value={newCatValue}
                    onChange={(e) => setNewCatValue(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-mono font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
                <button 
                  onClick={() => {
                    handleAddCategory(newCatName, parseFloat(newCatValue) || 0);
                    setNewCatName('');
                    setNewCatValue('');
                  }}
                  disabled={!newCatName}
                  className="mt-5 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:hover:bg-blue-600 flex items-center gap-2 uppercase tracking-widest shadow-lg shadow-blue-100"
                >
                  <Plus size={14} /> Adicionar
                </button>
              </div>
            )}
            
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="grid grid-cols-[1fr_200px_80px] bg-slate-50 border-b border-slate-200">
                <div className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest px-8">Nome da Categoria</div>
                <div className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right px-8">Média Mensal (R$)</div>
                <div className="p-4"></div>
              </div>
              <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
                {categories.map((cat) => (
                  <CategoryEditRow 
                    key={cat.id} 
                    category={cat} 
                    user={user} 
                    onUpdate={updateCategory}
                    onDelete={handleDeleteCategory}
                  />
                ))}
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                <div className="text-slate-500 text-xs font-medium">Total de {categories.length} categorias cadastradas</div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Média Mensal Consolidada</p>
                  <p className="text-xl font-black text-slate-800">
                    {totalMonthlyExpense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
              </div>
            </div>

            {!user && (
              <div className="mt-8 p-6 bg-amber-50 rounded-3xl border border-amber-100 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
                  <User size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-900 mb-1">Acesso Somente Leitura</h4>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Você está visualizando os valores atuais. Para editar as categorias ou valores médios, por favor, realize o login utilizando sua conta Google no menu lateral.
                  </p>
                </div>
              </div>
            )}
            
            <div className="mt-8 p-6 bg-blue-50 rounded-3xl border border-blue-100 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                <Info size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-blue-900 mb-1">Impacto das Alterações</h4>
                <p className="text-xs text-blue-700 leading-relaxed">
                  As alterações feitas nesta tela impactam instantaneamente o Dashboard e a Análise de Gaps. O sistema recalcula automaticamente os valores anuais e a cobertura necessária com base nos novos valores médios.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* Modal Detalhes do Plano de Aplicação */}
      <AnimatePresence>
        {detailsGrantId && (() => {
          const grant = grants.find(g => g.id === detailsGrantId);
          if (!grant) return null;
          
          return (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setDetailsGrantId(null)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg" style={{ backgroundColor: grant.color }}>
                      <LayoutDashboard size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-800">{grant.name}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Detalhamento do Plano de Aplicação</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setDetailsGrantId(null)}
                    className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Valor do Repasse</p>
                      <p className="text-2xl font-black text-slate-800">
                        {grant.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Vigência Planejada</p>
                      <p className="text-2xl font-black text-slate-800">{grant.periodMonths} Meses</p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status do Ciclo</p>
                      <p className="text-2xl font-black text-blue-600">{grant.status}</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categoria de Gasto</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Custo Mensal (Lar)</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Valor Destinado (Emenda)</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Cobertura (Meses)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(grant.allocations || []).map((alloc, idx) => {
                          const category = categories.find(c => c.id === alloc.categoryId);
                          const monthlyCost = category?.monthlyAverage || 0;
                          // O mensal médio da categoria pode ser 0 em casos como Investimento
                          const coverage = monthlyCost > 0 ? (alloc.amount / monthlyCost) : 0;

                          return (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-5">
                                <p className="text-sm font-bold text-slate-700 uppercase">{category?.name || alloc.categoryId}</p>
                                <p className="text-[9px] text-slate-400 font-medium">ID Interno: {alloc.categoryId}</p>
                              </td>
                              <td className="px-6 py-5 text-right font-mono text-xs font-bold text-slate-500">
                                {monthlyCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </td>
                              <td className="px-6 py-5 text-right font-mono text-sm font-black text-slate-800">
                                {alloc.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </td>
                              <td className="px-6 py-5 text-center">
                                <div className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-black tabular-nums shadow-sm ${
                                  coverage >= 12 ? 'bg-emerald-500 text-white' : 
                                  coverage >= 6 ? 'bg-blue-500 text-white' : 
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {coverage.toFixed(1)} <span className="ml-1 text-[8px] font-bold opacity-80 uppercase">Meses</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                    <ShieldCheck size={14} className="text-emerald-500" /> Sistema de Transparência e Eficiência de Recursos
                  </p>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Nova Emenda Modal */}
      <AnimatePresence>
        {isGrantModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsGrantModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    {editingGrantId ? 'Editar Emenda' : 'Cadastrar Nova Emenda'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {editingGrantId ? 'Atualize os dados da emenda selecionada.' : 'Preencha os dados da subvenção ou emenda parlamentar.'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsGrantModalOpen(false)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto space-y-6 flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Status da Emenda */}
                  <div className="space-y-4 col-span-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Status da Emenda</label>
                    <div className="flex bg-slate-100 p-1 rounded-2xl">
                      {(['Oficiada', 'Em Elaboração', 'Paga'] as const).map(s => (
                        <button 
                          key={s}
                          onClick={() => setNewGrant(prev => ({ ...prev, status: s }))}
                          className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                            newGrant.status === s ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          {s === 'Oficiada' && <Info size={14} />}
                          {s === 'Em Elaboração' && <Calendar size={14} />}
                          {s === 'Paga' && <CircleCheck size={14} />}
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="px-4 py-3 bg-blue-50/50 rounded-2xl border border-blue-100">
                      <p className="text-[10px] text-blue-700 leading-relaxed font-medium">
                        {newGrant.status === 'Oficiada' && "Emenda oficialmentada destinada pela instituição, aguardando pagamento."}
                        {newGrant.status === 'Em Elaboração' && "Entidade elaborando o plano de aplicação detalhado dos recursos."}
                        {newGrant.status === 'Paga' && "Recurso pago e disponível em conta para utilização."}
                      </p>
                    </div>
                  </div>

                  {/* Nome da Emenda */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Nome/Identificação</label>
                    <input 
                      type="text" 
                      placeholder="Ex: MIGUEL LOMBARDI (12345-X)"
                      value={newGrant.name}
                      onChange={(e) => setNewGrant(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>

                  {/* Valor Total */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Valor Total (R$)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs ring-offset-blue-50">R$</span>
                      <input 
                        type="number" 
                        placeholder="0,00"
                        value={newGrant.totalValue || ''}
                        onChange={(e) => setNewGrant(prev => ({ ...prev, totalValue: parseFloat(e.target.value) || 0 }))}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Tipo de Emenda */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Tipo de Emenda</label>
                    <select 
                      value={newGrant.type}
                      onChange={(e) => setNewGrant(prev => ({ ...prev, type: e.target.value as any }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="Emenda parlamentar">Emenda parlamentar</option>
                      <option value="Subvenção municipal">Subvenção municipal</option>
                      <option value="Emenda Impositiva (vereadores)">Emenda Impositiva (vereadores)</option>
                    </select>
                  </div>

                  {/* Natureza */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Natureza</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      {(['Custeio', 'Investimento'] as const).map(nat => (
                        <button 
                          key={nat}
                          onClick={() => setNewGrant(prev => ({ ...prev, nature: nat }))}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            newGrant.nature === nat ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          {nat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Prestação de Contas */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Prestação de Contas</label>
                    <select 
                      value={newGrant.accountability}
                      onChange={(e) => setNewGrant(prev => ({ ...prev, accountability: e.target.value as any }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="Direta com o município">Direta com o município</option>
                      <option value="Via São Paulo Sem Papel">Via São Paulo Sem Papel</option>
                    </select>
                  </div>

                  {/* Cor de Identificação */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Cor</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="color" 
                        value={newGrant.color}
                        onChange={(e) => setNewGrant(prev => ({ ...prev, color: e.target.value }))}
                        className="w-10 h-10 border-none rounded-lg cursor-pointer bg-transparent"
                      />
                      <span className="text-xs font-mono font-bold text-slate-400 uppercase">{newGrant.color}</span>
                    </div>
                  </div>

                  {/* Mês Inicial */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Mês Inicial</label>
                    <select 
                      value={newGrant.startMonth}
                      onChange={(e) => setNewGrant(prev => ({ ...prev, startMonth: parseInt(e.target.value) }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer"
                    >
                      {MONTHS.map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                      ))}
                    </select>
                  </div>

                  {/* Período (Meses) */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Período (Meses)</label>
                    <input 
                      type="number" 
                      min="1"
                      max="24"
                      value={newGrant.periodMonths}
                      onChange={(e) => setNewGrant(prev => ({ ...prev, periodMonths: parseInt(e.target.value) || 12 }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Plano de Aplicação Elaborado */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Plano de Aplicação</label>
                      <p className="text-[10px] text-slate-400 font-medium px-1">Selecione as categorias e defina os valores.</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Saldo da Emenda</p>
                      <p className={`text-sm font-black tabular-nums transition-colors ${
                        ((newGrant.totalValue || 0) - (newGrant.allocations || []).reduce((acc, a) => acc + a.amount, 0)) < 0 
                          ? 'text-red-500' 
                          : 'text-blue-600'
                      }`}>
                        {((newGrant.totalValue || 0) - (newGrant.allocations || []).reduce((acc, a) => acc + a.amount, 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {categories.map(cat => {
                      const allocation = (newGrant.allocations || []).find(a => a.categoryId === cat.id);
                      const isSelected = !!allocation;
                      const availableGap = analysis.monthlyGaps[cat.id]?.reduce((acc, val) => acc + val, 0) || 0;
                      
                      return (
                        <div 
                          key={cat.id}
                          className={`p-4 rounded-[24px] border transition-all ${
                            isSelected 
                              ? 'bg-white border-blue-200 shadow-md ring-1 ring-blue-50' 
                              : 'bg-slate-50 border-slate-100 opacity-80'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => {
                                  const current = newGrant.allocations || [];
                                  if (isSelected) {
                                    setNewGrant(prev => ({ ...prev, allocations: current.filter(a => a.categoryId !== cat.id) }));
                                  } else {
                                    setNewGrant(prev => ({ ...prev, allocations: [...current, { categoryId: cat.id, amount: 0 }] }));
                                  }
                                }}
                                className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                                  isSelected ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border-2 border-slate-200'
                                }`}
                              >
                                {isSelected && <CircleCheck size={14} />}
                              </button>
                              <div>
                                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-tight">{cat.name}</h4>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                                  Gap Disponível: {availableGap.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Custo Mensal</p>
                              <p className="text-xs font-black text-slate-600">
                                {cat.monthlyAverage.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-blue-50">
                              <div className="flex-1 relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 font-bold text-[10px]">R$</span>
                                <input 
                                  type="number" 
                                  placeholder="Valor a destinar"
                                  value={allocation.amount || ''}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setNewGrant(prev => ({
                                      ...prev,
                                      allocations: (prev.allocations || []).map(a => 
                                        a.categoryId === cat.id ? { ...a, amount: val } : a
                                      )
                                    }));
                                  }}
                                  className="w-full pl-8 pr-4 py-2 bg-blue-50/50 border border-blue-100 rounded-xl text-xs font-mono font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                              </div>
                              <div className="px-3 py-2 bg-slate-100 rounded-xl">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5 whitespace-nowrap">Meses Cobertos</p>
                                <p className="text-xs font-black text-slate-700 text-center">
                                  {(allocation.amount / cat.monthlyAverage).toFixed(1)}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3">
                <button 
                  onClick={() => setIsGrantModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-slate-600 transition-all uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSaveGrant}
                  className="px-10 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 uppercase tracking-widest flex items-center gap-2"
                >
                  <Plus size={16} /> {editingGrantId ? 'Salvar Alterações' : 'Salvar Emenda'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CategoryEditRow({ category, user, onUpdate, onDelete }: any) {
  const [localName, setLocalName] = useState(category.name);
  const [localValue, setLocalValue] = useState(category.monthlyAverage.toString());

  // Sync with remote if id matches and we're not focused
  useEffect(() => {
    setLocalName(category.name);
    setLocalValue(category.monthlyAverage.toString());
  }, [category.name, category.monthlyAverage]);

  const handleBlur = (field: keyof Category, value: string | number) => {
    if (value !== category[field]) {
      onUpdate(category.id, field, value);
    }
  };

  return (
    <div className="grid grid-cols-[1fr_200px_80px] items-center hover:bg-slate-50 transition-colors group">
      <div className="p-4 px-8">
        {user ? (
          <input 
            type="text" 
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={() => handleBlur('name', localName)}
            className="w-full bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-1 focus:ring-blue-500/20 rounded-lg py-2 px-2 -ml-2 transition-all hover:bg-white"
          />
        ) : (
          <span className="text-sm font-bold text-slate-700 py-2 inline-block">{category.name}</span>
        )}
      </div>
      <div className="p-4 px-8 flex items-center justify-end">
        <div className="relative group/input flex items-center">
          <span className="text-slate-400 text-xs mr-2 font-bold tracking-tighter">R$</span>
          {user ? (
            <input 
              type="number" 
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              onBlur={() => handleBlur('monthlyAverage', parseFloat(localValue) || 0)}
              className="w-32 bg-transparent border-none text-right text-sm font-mono font-bold text-slate-700 focus:ring-1 focus:ring-blue-500/20 rounded-lg py-2 px-2 transition-all hover:bg-white"
            />
          ) : (
            <span className="text-sm font-mono font-bold text-slate-700 tabular-nums">
              {category.monthlyAverage.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>
      </div>
      <div className="p-4 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        {user && (
          <button 
            onClick={() => onDelete(category.id)}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
            title="Excluir Categoria"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
        active ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
      }`}
    >
      {icon}
      <span className="text-sm">{label}</span>
      {active && <ChevronRight size={14} className="ml-auto" />}
    </button>
  );
}

function StatCard({ title, value, trend, icon }: { title: string, value: string, trend: string, icon: ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 bg-slate-50 rounded-2xl">
          {icon}
        </div>
        <span className={`text-[10px] font-extrabold px-2 py-1 rounded-full ${
          trend === 'Ativa' ? 'bg-emerald-50 text-emerald-600' : 
          trend === 'Atenção' ? 'bg-amber-50 text-amber-600' : 
          'bg-blue-50 text-blue-600'
        }`}>
          {trend}
        </span>
      </div>
      <div>
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</h4>
        <p className="text-2xl font-black text-slate-800 tracking-tight tabular-nums">{value}</p>
      </div>
    </div>
  );
}
