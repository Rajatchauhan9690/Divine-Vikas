import { createContext, useContext, useEffect, useMemo, useState } from "react";
const C = createContext(null);
export const useCart = () => useContext(C);
function readSavedItems() {
  try {
    const saved = JSON.parse(localStorage.getItem("divine-vikas-cart") || "[]");
    return Array.isArray(saved)
      ? saved.filter(
          (item) =>
            item &&
            typeof item._id === "string" &&
            Number.isInteger(item.qty) &&
            item.qty > 0,
        )
      : [];
  } catch (error) {
    console.error("Could not read the saved cart.", error);
    return [];
  }
}
export function CartProvider({ children }) {
  const [items, setItems] = useState(readSavedItems);
  useEffect(() => {
    try {
      localStorage.setItem("divine-vikas-cart", JSON.stringify(items));
    } catch (error) {
      console.error("Could not save the cart.", error);
    }
  }, [items]);
  const add = (p) =>
    setItems((old) => {
      const found = old.find((i) => i._id === p._id);
      return found
        ? old.map((i) => (i._id === p._id ? { ...i, qty: i.qty + 1 } : i))
        : [...old, { ...p, qty: 1 }];
    });
  const remove = (id) => setItems((old) => old.filter((i) => i._id !== id));
  const clear = () => setItems([]);
  const change = (id, qty) =>
    setItems((old) =>
      old.map((i) => (i._id === id ? { ...i, qty: Math.max(1, qty) } : i)),
    );
  const total = useMemo(
    () => items.reduce((s, i) => s + i.price * i.qty, 0),
    [items],
  );
  return (
    <C.Provider
      value={{
        items,
        add,
        remove,
        change,
        clear,
        total,
        count: items.reduce((s, i) => s + i.qty, 0),
      }}
    >
      {children}
    </C.Provider>
  );
}
