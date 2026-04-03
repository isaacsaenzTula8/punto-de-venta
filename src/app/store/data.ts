// Tipos de datos del sistema POS
export interface Product {
  id: string;
  name: string;
  brand?: string;
  price: number;
  discountedPrice?: number;
  hasActiveDiscount?: boolean;
  activeDiscountType?: "amount" | "percent" | null;
  activeDiscountValue?: number | null;
  activeDiscountStartAt?: string | null;
  activeDiscountEndAt?: string | null;
  category: string;
  image?: string;
  imageUrl?: string;
  stock: number;
  sku: string;
  barcode?: string;
  locationCode?: string;
  description?: string;
  presentations?: ProductPresentation[];
}

export interface ProductPresentation {
  id: number;
  name: string;
  sku?: string;
  barcode?: string;
  unitsFactor: number;
  price: number;
  isDefault?: boolean;
  active?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  date: Date;
  items: CartItem[];
  total: number;
  paymentMethod: 'cash' | 'card' | 'transfer';
  status: 'completed' | 'pending' | 'cancelled';
  cashier?: string;
}

export interface DailySummary {
  date: string;
  totalSales: number;
  totalTransactions: number;
  averageTicket: number;
  cashSales: number;
  cardSales: number;
  transferSales: number;
}

// Categorías de productos
export const categories = [
  'Todos',
  'Bebidas',
  'Alimentos',
  'Snacks',
  'Postres',
  'Cafetería',
  'Panadería',
  'Otros'
];

// Productos mock
export const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Café Americano',
    price: 35.00,
    category: 'Cafetería',
    stock: 100,
    sku: 'CAF-001',
    description: 'Café americano tradicional'
  },
  {
    id: '2',
    name: 'Cappuccino',
    price: 45.00,
    category: 'Cafetería',
    stock: 100,
    sku: 'CAF-002',
    description: 'Cappuccino con espuma de leche'
  },
  {
    id: '3',
    name: 'Latte',
    price: 48.00,
    category: 'Cafetería',
    stock: 100,
    sku: 'CAF-003',
    description: 'Café latte con arte'
  },
  {
    id: '4',
    name: 'Croissant',
    price: 32.00,
    category: 'Panadería',
    stock: 50,
    sku: 'PAN-001',
    description: 'Croissant de mantequilla'
  },
  {
    id: '5',
    name: 'Donut Chocolate',
    price: 28.00,
    category: 'Panadería',
    stock: 60,
    sku: 'PAN-002',
    description: 'Donut con cobertura de chocolate'
  },
  {
    id: '6',
    name: 'Sandwich Club',
    price: 85.00,
    category: 'Alimentos',
    stock: 30,
    sku: 'ALI-001',
    description: 'Sandwich club triple'
  },
  {
    id: '7',
    name: 'Ensalada César',
    price: 95.00,
    category: 'Alimentos',
    stock: 25,
    sku: 'ALI-002',
    description: 'Ensalada césar con pollo'
  },
  {
    id: '8',
    name: 'Papas Fritas',
    price: 38.00,
    category: 'Snacks',
    stock: 80,
    sku: 'SNK-001',
    description: 'Papas fritas crujientes'
  },
  {
    id: '9',
    name: 'Nachos',
    price: 65.00,
    category: 'Snacks',
    stock: 40,
    sku: 'SNK-002',
    description: 'Nachos con queso y jalapeños'
  },
  {
    id: '10',
    name: 'Coca Cola',
    price: 25.00,
    category: 'Bebidas',
    stock: 200,
    sku: 'BEB-001',
    description: 'Coca Cola 355ml'
  },
  {
    id: '11',
    name: 'Agua Mineral',
    price: 20.00,
    category: 'Bebidas',
    stock: 150,
    sku: 'BEB-002',
    description: 'Agua mineral 500ml'
  },
  {
    id: '12',
    name: 'Jugo Natural',
    price: 42.00,
    category: 'Bebidas',
    stock: 50,
    sku: 'BEB-003',
    description: 'Jugo natural de naranja'
  },
  {
    id: '13',
    name: 'Cheesecake',
    price: 58.00,
    category: 'Postres',
    stock: 20,
    sku: 'POS-001',
    description: 'Cheesecake de fresa'
  },
  {
    id: '14',
    name: 'Brownie',
    price: 45.00,
    category: 'Postres',
    stock: 35,
    sku: 'POS-002',
    description: 'Brownie de chocolate'
  },
  {
    id: '15',
    name: 'Muffin Arándanos',
    price: 35.00,
    category: 'Panadería',
    stock: 45,
    sku: 'PAN-003',
    description: 'Muffin de arándanos'
  },
  {
    id: '16',
    name: 'Bagel',
    price: 38.00,
    category: 'Panadería',
    stock: 40,
    sku: 'PAN-004',
    description: 'Bagel con queso crema'
  },
  {
    id: '17',
    name: 'Wrap Pollo',
    price: 78.00,
    category: 'Alimentos',
    stock: 28,
    sku: 'ALI-003',
    description: 'Wrap de pollo y vegetales'
  },
  {
    id: '18',
    name: 'Smoothie Frutas',
    price: 55.00,
    category: 'Bebidas',
    stock: 30,
    sku: 'BEB-004',
    description: 'Smoothie de frutas mixtas'
  }
];

// Ventas mock (últimos 30 días)
export const mockSales: Sale[] = generateMockSales();

function generateMockSales(): Sale[] {
  const sales: Sale[] = [];
  const paymentMethods: ('cash' | 'card' | 'transfer')[] = ['cash', 'card', 'transfer'];
  
  // Generar ventas de los últimos 30 días
  for (let i = 0; i < 150; i++) {
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 30));
    date.setHours(Math.floor(Math.random() * 12) + 8); // Entre 8am y 8pm
    
    const numItems = Math.floor(Math.random() * 4) + 1;
    const items: CartItem[] = [];
    
    for (let j = 0; j < numItems; j++) {
      const product = mockProducts[Math.floor(Math.random() * mockProducts.length)];
      const quantity = Math.floor(Math.random() * 3) + 1;
      items.push({
        product,
        quantity,
        subtotal: product.price * quantity
      });
    }
    
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    
    sales.push({
      id: `SALE-${String(i + 1).padStart(6, '0')}`,
      date,
      items,
      total,
      paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
      status: 'completed',
      cashier: 'Usuario Admin'
    });
  }
  
  return sales.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// Calcular resumen diario
export function getDailySummary(): DailySummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todaySales = mockSales.filter(sale => {
    const saleDate = new Date(sale.date);
    saleDate.setHours(0, 0, 0, 0);
    return saleDate.getTime() === today.getTime();
  });
  
  const totalSales = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const totalTransactions = todaySales.length;
  const averageTicket = totalTransactions > 0 ? totalSales / totalTransactions : 0;
  
  const cashSales = todaySales
    .filter(s => s.paymentMethod === 'cash')
    .reduce((sum, sale) => sum + sale.total, 0);
  
  const cardSales = todaySales
    .filter(s => s.paymentMethod === 'card')
    .reduce((sum, sale) => sum + sale.total, 0);
  
  const transferSales = todaySales
    .filter(s => s.paymentMethod === 'transfer')
    .reduce((sum, sale) => sum + sale.total, 0);
  
  return {
    date: today.toISOString(),
    totalSales,
    totalTransactions,
    averageTicket,
    cashSales,
    cardSales,
    transferSales
  };
}

// Obtener datos para gráficos (últimos 7 días)
export function getLast7DaysData() {
  const data = [];
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    const daySales = mockSales.filter(sale => {
      const saleDate = new Date(sale.date);
      saleDate.setHours(0, 0, 0, 0);
      return saleDate.getTime() === date.getTime();
    });
    
    const total = daySales.reduce((sum, sale) => sum + sale.total, 0);
    
    data.push({
      date: date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' }),
      ventas: total,
      transacciones: daySales.length
    });
  }
  
  return data;
}

// Top productos más vendidos
export function getTopProducts(limit: number = 10) {
  const productSales: { [key: string]: { product: Product; totalQuantity: number; totalRevenue: number } } = {};
  
  mockSales.forEach(sale => {
    sale.items.forEach(item => {
      if (!productSales[item.product.id]) {
        productSales[item.product.id] = {
          product: item.product,
          totalQuantity: 0,
          totalRevenue: 0
        };
      }
      productSales[item.product.id].totalQuantity += item.quantity;
      productSales[item.product.id].totalRevenue += item.subtotal;
    });
  });
  
  return Object.values(productSales)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit);
}
