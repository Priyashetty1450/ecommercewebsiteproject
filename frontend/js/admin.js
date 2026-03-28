let products = [];
let orders = [];

const API_URL = ""; // use same origin; backend serves frontend and API under same host

const ORDER_STATUSES = [
  "Order Placed",
  "Order Packed",
  "Order Shipped",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
  "Refunded"
];

/* ================= LOAD PRODUCTS ================= */

async function loadProducts() {
  try {
    const res = await fetch(`${API_URL}/api/products`);
    products = await res.json();

    renderProducts();
    updateSummary();

  } catch (err) {
    console.error("Product load error:", err);
  }
}

/* ================= LOAD ORDERS ================= */

async function loadOrders() {
  try {
    const res = await fetch(`${API_URL}/api/orders`);
    orders = await res.json();

    renderOrders();
    updateSummary();

  } catch (err) {
    console.error("Order load error:", err);
  }
}

/* ================= SUMMARY ================= */

function updateSummary() {
  document.getElementById("total-products").textContent = products.length;
  document.getElementById("total-orders").textContent = orders.length;
}

/* ================= RENDER PRODUCTS ================= */

function renderProducts() {
  const list = document.getElementById("product-list");
  list.innerHTML = "";

  products.forEach((p, index) => {
    list.innerHTML += `
      <div class="product-card">
        <img src="${p.image}" />
        <h3>${p.name}</h3>
        <p>₹${p.price}</p>
        <button class="btn" onclick="editProduct(${index})">Edit</button>
        <button class="btn" onclick="deleteProduct('${p._id}')">Delete</button>
      </div>
    `;
  });
}

/* ================= RENDER ORDERS ================= */

function renderOrders() {
  const tbody = document.querySelector("#order-table tbody");
  tbody.innerHTML = "";

  orders.forEach(order => {

    const options = ORDER_STATUSES.map(
      s => `<option ${order.status === s ? "selected" : ""}>${s}</option>`
    ).join("");

    tbody.innerHTML += `
      <tr>
        <td>${order.orderId}</td>
        <td>${order.customer}</td>
        <td>₹${order.total}</td>
        <td>
          <select id="status-${order.orderId}">
            ${options}
          </select>
        </td>
        <td>
          <button class="btn" onclick="updateOrderStatus('${order.orderId}')">
            Update
          </button>
          <button class="btn" onclick="deleteOrder('${order._id}')">
            Delete
          </button>
        </td>
      </tr>
    `;
  });
}

/* ================= ADD PRODUCT ================= */

document.getElementById("product-form")
.addEventListener("submit", async e => {

  e.preventDefault();

  const file = document.getElementById("product-image").files[0];

  if (!file) {
    alert("Please select an image");
    return;
  }

  const reader = new FileReader();

  reader.onload = async () => {

    const newProduct = {
      name: document.getElementById("product-name").value,
      price: document.getElementById("product-price").value,
      stock: document.getElementById("product-stock").value,
      category: document.getElementById("product-category").value,
      description: document.getElementById("product-description").value,
      image: reader.result
    };

    try {
      const res = await fetch(`${API_URL}/api/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(newProduct)
      });

      const data = await res.json();
      console.log(data);

      alert("Product added successfully ✅");

      loadProducts();
      document.getElementById("product-form").reset();

    } catch (err) {
      console.error("Product add error:", err);
    }
  };

  reader.readAsDataURL(file);
});

/* ================= UPDATE ORDER STATUS ================= */

async function updateOrderStatus(orderId) {
  const status = document.getElementById(`status-${orderId}`).value;

  try {
    const res = await fetch(`${API_URL}/api/orders/status/${orderId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status })
    });

    const data = await res.json();

    if (data.success) {
      alert("Order status updated");
      loadOrders();
    }

  } catch (error) {
    console.error("Update failed:", error);
  }
}

/* ================= DELETE ORDER ================= */

async function deleteOrder(id) {
  try {
    await fetch(`${API_URL}/api/orders/${id}`, {
      method: "DELETE"
    });

    loadOrders();

  } catch (err) {
    console.error("Delete error:", err);
  }
}

/* ================= EDIT PRODUCT ================= */

async function editProduct(index) {
  const newPrice = prompt("Enter new price");

  if (!newPrice) return;

  const product = products[index];

  try {
    await fetch(`${API_URL}/api/products/${product._id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ price: newPrice })
    });

    loadProducts();

  } catch (err) {
    console.error("Edit failed:", err);
  }
}

/* ================= DELETE PRODUCT ================= */

async function deleteProduct(id) {
  try {
    await fetch(`${API_URL}/api/products/${id}`, {
      method: "DELETE"
    });

    loadProducts();

  } catch (err) {
    console.error("Delete failed:", err);
  }
}

/* ================= INIT ================= */

loadProducts();
loadOrders();