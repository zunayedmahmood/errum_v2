'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { Plus } from 'lucide-react';
import FieldTable from '@/components/FieldTable';
import SearchBar from '@/components/SearchBar';
import PaginationControls from '@/components/PaginationControls';
import AddItemModal from '@/components/AddItemModal';
import { fieldService, Field } from '@/services/fieldService';

export default function FieldPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fields, setFields] = useState<Field[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fieldsPerPage = 4;

  useEffect(() => {
    fetchFields();
  }, []);

  const fetchFields = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fieldService.getFields();
      setFields(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Error fetching fields:', error);
      setError(error.response?.data?.message || 'Failed to fetch fields');
      setFields([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredFields = useMemo(() => {
    if (!Array.isArray(fields)) {
      return [];
    }
    
    return fields.filter((f) =>
      f?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [fields, searchTerm]);

  const totalPages = Math.ceil(filteredFields.length / fieldsPerPage);
  const startIndex = (currentPage - 1) * fieldsPerPage;
  const currentFields = filteredFields.slice(startIndex, startIndex + fieldsPerPage);

  const handleAddField = async (data: Record<string, string | number>) => {
    try {
      console.log('Form data received:', data);
      
      if (!data.name || !data.type) {
        alert('Please fill in all required fields (Name and Type)');
        return;
      }

      const newFieldData = { 
        title: data.name as string,
        name: data.name as string,
        type: data.type as string,
        is_active: true,
      };

      console.log('Sending to API:', newFieldData);

      const savedField = await fieldService.createField(newFieldData);
      console.log('API response:', savedField);
      
      setFields((prev) => [...prev, savedField]);
      setShowForm(false);
      setError(null);
    } catch (error: any) {
      console.error('Error saving field:', error);
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message ||
                          'Failed to save field';
      setError(errorMessage);
      alert(errorMessage);
    }
  };

  const handleEditField = async (data: Record<string, string | number>) => {
    if (!editingField) return;

    try {
      console.log('Form data received:', data);
      
      if (!data.name || !data.type) {
        alert('Please fill in all required fields (Name and Type)');
        return;
      }

      const updatedFieldData = {
        id: editingField.id,
        title: data.name as string,
        name: data.name as string,
        type: data.type as string,
      };

      console.log('Updating with data:', updatedFieldData);

      const savedField = await fieldService.updateField(editingField.id, updatedFieldData);
      console.log('API response:', savedField);
      
      setFields((prev) => 
        prev.map((f) => (f.id === editingField.id ? savedField : f))
      );
      setShowForm(false);
      setEditingField(null);
      setError(null);
    } catch (error: any) {
      console.error('Error updating field:', error);
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message ||
                          'Failed to update field';
      setError(errorMessage);
      alert(errorMessage);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this field?')) return;

    try {
      await fieldService.deleteField(id);
      setFields(fields.filter((f) => f.id !== id));
      setError(null);
    } catch (error: any) {
      console.error('Error deleting field:', error);
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Failed to delete field';
      setError(errorMessage);
      alert(errorMessage);
    }
  };

  const handleEdit = (field: Field) => {
    setEditingField(field);
    setShowForm(true);
  };

  const handleCloseModal = () => {
    setShowForm(false);
    setEditingField(null);
  };

  return (
    <div className={`${darkMode ? 'dark' : ''} flex h-screen`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 bg-gray-50 dark:bg-gray-900 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Fields
            </h2>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Field
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <SearchBar value={searchTerm} onChange={setSearchTerm} />
          
          {isLoading ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Loading fields...
            </div>
          ) : (
            <>
              <FieldTable 
                fields={currentFields} 
                onDelete={handleDelete}
                onEdit={handleEdit}
              />
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </>
          )}

          <AddItemModal
            open={showForm}
            title={editingField ? 'Edit Field' : 'Add New Field'}
            fields={[
              { name: 'name', label: 'Field Name', type: 'text' },
              { 
                name: 'type', 
                label: 'Type', 
                type: 'select', 
                options: ['text', 'textarea', 'number', 'email', 'url', 'tel', 'date', 'datetime', 'time', 'select', 'radio', 'checkbox', 'file', 'image', 'color', 'range']
              },
            ]}
            initialData={{
              name: editingField?.title || editingField?.name || '',
              type: editingField?.type || ''
            }}
            onClose={handleCloseModal}
            onSave={editingField ? handleEditField : handleAddField}
          />

        </main>
      </div>
    </div>
  );
}