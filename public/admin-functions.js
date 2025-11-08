// ==================== إدارة الأقسام ====================

// دالة عرض نافذة إضافة قسم
function showAddCategoryModal() {
    const modal = document.getElementById('addCategoryModal');
    if (modal) {
        if (typeof closeAllModals === 'function') closeAllModals();
        modal.style.display = 'block';
        // مسح النموذج
        document.getElementById('addCategoryForm').reset();
    }
}

// دالة إغلاق نافذة إضافة قسم
function closeAddCategoryModal() {
    const modal = document.getElementById('addCategoryModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// دالة عرض نافذة تعديل قسم
function showEditCategoryModal(categoryId) {
    const modal = document.getElementById('editCategoryModal');
    if (modal) {
        if (typeof closeAllModals === 'function') closeAllModals();
        modal.style.display = 'block';
        
        // البحث عن القسم وتعبئة النموذج
        const category = categories.find(c => c._id === categoryId);
        if (category) {
            document.getElementById('editCategoryId').value = category._id;
            document.getElementById('editCategoryName').value = category.name;
            document.getElementById('editCategoryDescription').value = category.description || '';
            document.getElementById('editCategoryIcon').value = category.icon || '';
            document.getElementById('editCategoryImage').value = category.image || '';
            document.getElementById('editCategoryActive').checked = category.isActive;
        }
    }
}

// دالة إغلاق نافذة تعديل قسم
function closeEditCategoryModal() {
    const modal = document.getElementById('editCategoryModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// دالة إضافة قسم جديد
async function handleAddCategory(event) {
    event.preventDefault();
    const fd = new FormData();
    fd.append('name', document.getElementById('categoryName').value);
    fd.append('description', document.getElementById('categoryDescription').value || '');
    const iconOnlyInput = document.getElementById('categoryIconFile');
    if (!iconOnlyInput || !iconOnlyInput.files || !iconOnlyInput.files[0]) {
        showMessage('يرجى اختيار صورة الأيقونة للقسم', 'error');
        return;
    }
    // نستخدم نفس الحقل في الخادم كـ image لتخزين صورة القسم (أيقونة)
    fd.append('image', iconOnlyInput.files[0]);
    const iconInput = document.getElementById('categoryIconFile');
    if (iconInput && iconInput.files && iconInput.files[0]) {
        fd.append('icon', iconInput.files[0]);
    }
    
    try {
        const response = await fetch('/api/categories', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: fd
        });
        
        const result = await response.json();
        
        if (result.success) {
            showMessage('تم إضافة القسم بنجاح', 'success');
            closeAddCategoryModal();
            refreshCategories();
        } else {
            showMessage(result.error || 'خطأ في إضافة القسم', 'error');
        }
    } catch (error) {
        console.error('خطأ في إضافة القسم:', error);
        showMessage('خطأ في الاتصال بالخادم', 'error');
    }
}

// دالة تعديل قسم
async function handleEditCategory(event) {
    event.preventDefault();
    
    const categoryId = document.getElementById('editCategoryId').value;
    const fd = new FormData();
    fd.append('name', document.getElementById('editCategoryName').value);
    fd.append('description', document.getElementById('editCategoryDescription').value || '');
    fd.append('isActive', document.getElementById('editCategoryActive').checked ? 'true' : 'false');
    const editIconOnlyInput = document.getElementById('editCategoryIconFile');
    if (editIconOnlyInput && editIconOnlyInput.files && editIconOnlyInput.files[0]) {
        fd.append('image', editIconOnlyInput.files[0]);
    }
    
    try {
        const response = await fetch(`/api/categories/${categoryId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: fd
        });
        
        const result = await response.json();
        
        if (result.success) {
            showMessage('تم تحديث القسم بنجاح', 'success');
            closeEditCategoryModal();
            refreshCategories();
        } else {
            showMessage(result.error || 'خطأ في تحديث القسم', 'error');
        }
    } catch (error) {
        console.error('خطأ في تحديث القسم:', error);
        showMessage('خطأ في الاتصال بالخادم', 'error');
    }
}

// دالة حذف قسم
async function deleteCategory(categoryId) {
    if (!confirm('هل أنت متأكد من حذف هذا القسم؟')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/categories/${categoryId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showMessage('تم حذف القسم بنجاح', 'success');
            refreshCategories();
        } else {
            showMessage(result.error || 'خطأ في حذف القسم', 'error');
        }
    } catch (error) {
        console.error('خطأ في حذف القسم:', error);
        showMessage('خطأ في الاتصال بالخادم', 'error');
    }
}

// دالة تحديث قائمة الأقسام
async function refreshCategories() {
    try {
        const response = await fetch('/api/categories', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            categories = result.categories;
            displayCategories();
        } else {
            showMessage('خطأ في تحميل الأقسام', 'error');
        }
    } catch (error) {
        console.error('خطأ في تحميل الأقسام:', error);
        showMessage('خطأ في الاتصال بالخادم', 'error');
    }
}

// دالة عرض الأقسام في لوحة الإدارة
function displayCategories() {
    const categoriesList = document.getElementById('categoriesList');
    if (!categoriesList) return;
    
    if (categories.length === 0) {
        categoriesList.innerHTML = '<p>لا توجد أقسام حالياً</p>';
        return;
    }
    
    const categoriesHTML = categories.map(category => `
        <div class="admin-item">
            <div class="item-info">
                <div class="item-icon">
                    <i class="${category.icon || 'fas fa-tag'}"></i>
                </div>
                <div class="item-details">
                    <h4>${category.name}</h4>
                    <p>${category.description || 'لا يوجد وصف'}</p>
                    <span class="item-status ${category.isActive ? 'active' : 'inactive'}">
                        ${category.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn-edit" onclick="showEditCategoryModal('${category._id}')">
                    <i class="fas fa-edit"></i>
                    تعديل
                </button>
                <button class="btn-delete" onclick="deleteCategory('${category._id}')">
                    <i class="fas fa-trash"></i>
                    حذف
                </button>
            </div>
        </div>
    `).join('');
    
    categoriesList.innerHTML = categoriesHTML;
}

// ==================== إدارة المنتجات المحدثة ====================

// دالة عرض نافذة إضافة منتج
function showAddProductModal() {
    const modal = document.getElementById('addProductModal');
    if (modal) {
        modal.style.display = 'block';
        // مسح النموذج
        document.getElementById('addProductForm').reset();
        // تحميل الأقسام في القائمة المنسدلة
        loadCategoriesForProductForm();
    }
}

// دالة إغلاق نافذة إضافة منتج
function closeAddProductModal() {
    const modal = document.getElementById('addProductModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// دالة تحميل الأقسام في نموذج المنتج
async function loadCategoriesForProductForm() {
    console.log('🔄 جاري تحميل الأقسام لنموذج المنتج...');
    const categorySelect = document.getElementById('productCategory');
    if (!categorySelect) {
        console.error('❌ لم يتم العثور على productCategory');
        return;
    }
    
    // مسح الخيارات الموجودة
    categorySelect.innerHTML = '<option value="">اختر القسم</option>';
    
    try {
        // جلب الأقسام من الخادم
        const response = await fetch('/api/categories');
        const result = await response.json();
        
        if (result.success && result.categories) {
            categories = result.categories;
            console.log('✅ تم تحميل الأقسام:', categories.length, 'قسم');
            
            // إضافة الأقسام النشطة فقط
            const activeCategories = categories.filter(c => c.isActive !== false);
            activeCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.name;
                option.textContent = category.name;
                categorySelect.appendChild(option);
            });
            
            console.log('✅ تم إضافة الأقسام إلى القائمة:', activeCategories.length, 'قسم');
        } else {
            console.error('❌ فشل في جلب الأقسام:', result);
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل الأقسام:', error);
    }
}

// دالة إضافة منتج جديد (FormData مع رفع صورة)
async function handleAddProduct(event) {
    event.preventDefault();
    const formEl = document.getElementById('addProductForm');
    const fd = new FormData();
    fd.append('name', document.getElementById('productName').value);
    fd.append('description', document.getElementById('productDescription').value);
    fd.append('category', document.getElementById('productCategory').value);
    fd.append('price', document.getElementById('productPrice').value);
    fd.append('originalPrice', document.getElementById('productOriginalPrice').value);
    fd.append('stock', document.getElementById('productStock').value || '0');
    const fileInput = document.getElementById('productImage');
    if (fileInput && fileInput.files && fileInput.files[0]) {
        fd.append('image', fileInput.files[0]);
    }
    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: fd
        });
        const result = await response.json();
        if (result.success) {
            showMessage('تم إضافة المنتج بنجاح', 'success');
            closeAddProductModal();
            refreshProducts();
        } else {
            showMessage(result.error || 'خطأ في إضافة المنتج', 'error');
        }
    } catch (error) {
        console.error('خطأ في إضافة المنتج:', error);
        showMessage('خطأ في الاتصال بالخادم', 'error');
    }
}

// دالة تحديث قائمة المنتجات
async function refreshProducts() {
    try {
        const response = await fetch('/api/products', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            products = result.products;
            
            // إضافة صور افتراضية للمنتجات التي لا تحتوي على صور
            products.forEach(product => {
                if (!product.image) {
                    product.image = '/images/placeholder.svg';
                }
            });
            
            displayAdminProducts();
        } else {
            showMessage('خطأ في تحميل المنتجات', 'error');
        }
    } catch (error) {
        console.error('خطأ في تحميل المنتجات:', error);
        showMessage('خطأ في الاتصال بالخادم', 'error');
    }
}

// دالة عرض المنتجات في لوحة الإدارة
function displayAdminProducts() {
    const productsList = document.getElementById('productsList');
    if (!productsList) return;
    
    if (products.length === 0) {
        productsList.innerHTML = '<p>لا توجد منتجات حالياً</p>';
        return;
    }
    
    const productsHTML = products.map(product => `
        <div class="admin-item">
            <div class="item-info">
                <div class="item-icon">
                    <img src="${product.image || '/images/placeholder.svg'}" alt="${product.name}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <div style="display:none; width:60px;height:60px;background:#f0f0f0;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#666;">
                        <i class="fas fa-box" style="font-size:24px;"></i>
                    </div>
                </div>
                <div class="item-details">
                    <h4>${product.name}</h4>
                    <p>${product.description}</p>
                    <small>الفئة: ${product.category} | السعر: ${product.price} شيكل | المخزون: ${product.stock}</small>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn-edit" onclick="editProduct('${product.id}')">
                    تعديل
                </button>
                <button class="btn-delete" onclick="deleteProduct('${product.id}')">
                    حذف
                </button>
            </div>
        </div>
    `).join('');
    
    productsList.innerHTML = productsHTML;
}

// دالة حذف منتج
async function deleteProduct(productId) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/products/${productId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const result = await response.json();
        
        if (result.success) {
            showMessage('تم حذف المنتج بنجاح', 'success');
            refreshProducts();
        } else {
            showMessage(result.error || 'خطأ في حذف المنتج', 'error');
        }
    } catch (error) {
        console.error('خطأ في حذف المنتج:', error);
        showMessage('خطأ في الاتصال بالخادم', 'error');
    }
}

// دالة تعديل منتج
function editProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    // ملء نموذج التعديل
    document.getElementById('editProductId').value = product.id;
    document.getElementById('editProductName').value = product.name;
    document.getElementById('editProductDescription').value = product.description;
    document.getElementById('editProductPrice').value = product.price;
    document.getElementById('editProductOriginalPrice').value = product.originalPrice || '';
    document.getElementById('editProductStock').value = product.stock;
    document.getElementById('editProductCategory').value = product.category;
    document.getElementById('editProductImages').value = product.images ? product.images.join(', ') : '';
    
    // إظهار نافذة التعديل
    const modal = document.getElementById('editProductModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

// ==================== تحليل الأرباح ====================

// دالة تحديث بيانات الأرباح
async function refreshProfits() {
    try {
        const response = await fetch('/api/admin/profits', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            displayProfits(result.profitData);
        } else {
            showMessage('خطأ في تحميل بيانات الأرباح', 'error');
        }
    } catch (error) {
        console.error('خطأ في تحميل بيانات الأرباح:', error);
        showMessage('خطأ في الاتصال بالخادم', 'error');
    }
}

// دالة عرض بيانات الأرباح
function displayProfits(profitData) {
    const profitsContent = document.getElementById('profitsContent');
    if (!profitsContent) return;
    
    const profitsHTML = `
        <div class="profits-summary">
            <div class="profit-card">
                <h4>إجمالي الإيرادات</h4>
                <span class="profit-value revenue">${profitData.totalRevenue.toFixed(2)} شيكل</span>
            </div>
            <div class="profit-card">
                <h4>إجمالي التكلفة</h4>
                <span class="profit-value cost">${profitData.totalCost.toFixed(2)} شيكل</span>
            </div>
            <div class="profit-card">
                <h4>صافي الربح</h4>
                <span class="profit-value profit">${profitData.totalProfit.toFixed(2)} شيكل</span>
            </div>
            <div class="profit-card">
                <h4>هامش الربح</h4>
                <span class="profit-value margin">${profitData.profitMargin}%</span>
            </div>
        </div>
        
        <div class="product-profits">
            <h4>أرباح المنتجات</h4>
            <div class="profits-table">
                <table>
                    <thead>
                        <tr>
                            <th>اسم المنتج</th>
                            <th>الكمية المباعة</th>
                            <th>الإيرادات</th>
                            <th>التكلفة</th>
                            <th>الربح</th>
                            <th>هامش الربح</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${profitData.productProfits.map(product => `
                            <tr>
                                <td>${product.productName}</td>
                                <td>${product.quantity}</td>
                                <td>${product.revenue.toFixed(2)} شيكل</td>
                                <td>${product.cost.toFixed(2)} شيكل</td>
                                <td class="${product.profit >= 0 ? 'positive' : 'negative'}">${product.profit.toFixed(2)} شيكل</td>
                                <td>${product.profitMargin}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    profitsContent.innerHTML = profitsHTML;
}

// ==================== إدارة الإعلان والخصم العام ====================

async function fetchAnnouncement() {
    const r = await fetch('/api/announcement');
    const j = await r.json();
    return j.success ? j.announcement : null;
}

async function loadAnnouncementForAdmin() {
    try {
        const a = await fetchAnnouncement();
        if (!a) return;
        const visible = document.getElementById('annVisible');
        const title = document.getElementById('annTitle');
        const content = document.getElementById('annContent');
        const discount = document.getElementById('annDiscount');
        const applyDiscount = document.getElementById('annApplyDiscount');
        if (visible) visible.checked = !!a.isVisible;
        if (title) title.value = a.title || '';
        if (content) content.value = a.content || '';
        if (discount) discount.value = a.discountPercent || 0;
        if (applyDiscount) applyDiscount.checked = !!a.applyDiscount;
        const prev = document.getElementById('announcementPreview');
        if (prev) {
            prev.innerHTML = `
                <div class="announcement-card">
                  <div class="announcement-media">${a.image ? `<img src="${a.image}"/>` : ''}</div>
                  <div class="announcement-body">
                      <h3>${a.title || ''}</h3>
                      <p>${a.content || ''}</p>
                      ${a.applyDiscount && a.discountPercent>0 ? `<div class="announcement-discount">خصم ${a.discountPercent}% مفعل</div>` : ''}
                  </div>
                </div>`;
        }
    } catch (e) {
        console.error('خطأ تحميل الإعلان:', e);
    }
}

async function handleSaveAnnouncement(event){
    event.preventDefault();
    try{
        const fd = new FormData();
        fd.append('isVisible', document.getElementById('annVisible').checked ? '1' : '0');
        fd.append('title', document.getElementById('annTitle').value || '');
        fd.append('content', document.getElementById('annContent').value || '');
        fd.append('discountPercent', document.getElementById('annDiscount').value || '0');
        fd.append('applyDiscount', document.getElementById('annApplyDiscount').checked ? '1' : '0');
        const img = document.getElementById('annImage');
        if (img && img.files && img.files[0]) fd.append('image', img.files[0]);
        const r = await fetch('/api/admin/announcement', { method:'POST', body: fd, headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const j = await r.json();
        if (!j.success) return showMessage(j.error || 'فشل حفظ الإعلان', 'error');
        showMessage('تم حفظ الإعلان والخصم بنجاح', 'success');
        loadAnnouncementForAdmin();
        await loadAnnouncementForClient();
    }catch(e){
        console.error('حفظ الإعلان:', e);
        showMessage('خطأ في الاتصال بالخادم', 'error');
    }
}

async function loadAnnouncementForClient(){
    try{
        const a = await fetchAnnouncement();
        const section = document.getElementById('announcementSection');
        if (!section || !a) return;
        section.style.display = a.isVisible ? 'block' : 'none';
        const img = document.getElementById('announcementImage');
        const title = document.getElementById('announcementTitle');
        const content = document.getElementById('announcementContent');
        const discount = document.getElementById('announcementDiscount');
        if (img){ if (a.image){ img.src = a.image; img.style.display='block'; } else { img.style.display='none'; } }
        if (title) title.textContent = a.title || '';
        if (content) content.textContent = a.content || '';
        if (discount){
            if (a.applyDiscount && a.discountPercent>0){
                discount.style.display='block';
                discount.textContent = `خصم عام ${a.discountPercent}% على كل المنتجات`;
            } else {
                discount.style.display='none';
            }
        }
        // تخزين إعداد الخصم لاستخدامه في واجهة المتجر
        window.globalDiscount = {
            enabled: !!a.applyDiscount,
            percent: Number(a.discountPercent)||0
        };
    }catch(e){ console.warn('تعذر تحميل الإعلان:', e); }
}

// أرباح شهرية - عرض
function displayMonthlyProfits(monthly) {
    const profitsContent = document.getElementById('profitsContent');
    if (!profitsContent) return;
    const rows = (monthly || []).map(m => `
        <tr>
            <td>${m.month}</td>
            <td>${m.totalRevenue.toFixed(2)} شيكل</td>
            <td>${m.totalCost.toFixed(2)} شيكل</td>
            <td class="${m.totalProfit >= 0 ? 'positive' : 'negative'}">${m.totalProfit.toFixed(2)} شيكل</td>
            <td>${m.margin}%</td>
        </tr>
    `).join('');
    const html = `
        <h4>الأرباح الشهرية</h4>
        <div class="profits-table">
            <table>
                <thead>
                    <tr>
                        <th>الشهر</th>
                        <th>الإيراد</th>
                        <th>التكلفة</th>
                        <th>الربح</th>
                        <th>هامش الربح</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="5">لا يوجد بيانات</td></tr>'}</tbody>
            </table>
        </div>`;
    profitsContent.insertAdjacentHTML('beforeend', html);
}

// أرباح شهرية - جلب
async function refreshMonthlyProfits() {
    try {
        const r = await fetch('/api/admin/profits/monthly');
        const j = await r.json();
        if (!j.success) {
            showMessage('خطأ في تحميل الأرباح الشهرية', 'error');
            return;
        }
        displayMonthlyProfits(j.monthly);
    } catch (e) {
        showMessage('خطأ في الاتصال بالخادم', 'error');
    }
}

// تحديث دالة showAdminTab لتشمل التبويبات الجديدة
function showAdminTab(tabName) {
    // منع عرض تبويب الأرباح لغير (admin / manager)
    if (tabName === 'profits' && !(currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager'))) {
        showMessage('هذا القسم خاص بالإدارة فقط', 'warning');
        return;
    }
    // إخفاء جميع علامات التبويب
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => tab.classList.remove('active'));
    
    // إزالة التفعيل من جميع الأزرار
    const tabButtons = document.querySelectorAll('.admin-tabs .tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // إظهار التبويب المطلوب
    const targetTab = document.getElementById(tabName + 'Tab');
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // تفعيل الزر المطلوب
    const targetBtn = document.querySelector(`[onclick="showAdminTab('${tabName}')"]`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    }
    
    // تحميل البيانات حسب التبويب
    switch(tabName) {
        case 'categories':
            refreshCategories();
            break;
        case 'products':
            refreshProducts();
            break;
        case 'profits':
            refreshProfits();
            refreshMonthlyProfits();
            break;
        case 'stats':
            loadAdminStats();
            break;
    }
}

// دالة مؤقتة لإحصائيات لوحة الإدارة لمنع الخطأ
function loadAdminStats() {
    const statsContent = document.getElementById('statsContent');
    if (!statsContent) return;
    statsContent.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>سيتم تفعيل إحصائيات الإدارة لاحقاً</p>
        </div>
    `;
}

// تحديث دالة loadAdminData لتشمل الأقسام
async function loadAdminData() {
    try {
        // تحميل الأقسام
        const categoriesResponse = await fetch('/api/categories', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (categoriesResponse.ok) {
            const categoriesResult = await categoriesResponse.json();
            if (categoriesResult.success) {
                categories = categoriesResult.categories;
            }
        }
        
        // تحميل المنتجات
        const productsResponse = await fetch('/api/products', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (productsResponse.ok) {
            const productsResult = await productsResponse.json();
            if (productsResult.success) {
                products = productsResult.products;
            }
        }
        
        console.log('✅ تم تحميل بيانات الإدارة بنجاح');
    } catch (error) {
        console.error('خطأ في تحميل بيانات الإدارة:', error);
    }
}
