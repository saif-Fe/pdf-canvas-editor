'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Transformer, Rect } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import dynamic from 'next/dynamic';

interface PageInfo {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  selected: boolean;
}

interface CanvasImage {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
}

const CanvasImageComponent = ({ 
  image, 
  isSelected, 
  onSelect, 
  onChange,
  applySnapping,
  onSnapGuides,
  getSnapPoints,
  snapTolerance
}: {
  image: CanvasImage;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (newAttrs: Partial<CanvasImage>) => void;
  applySnapping: (imageId: string, x: number, y: number, width: number, height: number) => {x: number, y: number};
  onSnapGuides: (guides: {x: number[], y: number[]}) => void;
  getSnapPoints: (excludeId?: string) => {vertical: number[], horizontal: number[]};
  snapTolerance: number;
}) => {
  const [img] = useImage(image.src);
  const shapeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  React.useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <KonvaImage
        ref={shapeRef}
        {...image}
        image={img}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={(e) => {
          try {
            // Show snap guides when starting to drag
            const node = e.target;
            const snapPoints = getSnapPoints(image.id);
            if (snapPoints && snapPoints.vertical && snapPoints.horizontal) {
              onSnapGuides({
                x: snapPoints.vertical.filter(x => Math.abs(x - node.x()) <= snapTolerance * 3),
                y: snapPoints.horizontal.filter(y => Math.abs(y - node.y()) <= snapTolerance * 3)
              });
            }
          } catch (error) {
            console.error('Drag start error:', error);
          }
        }}
        onDragMove={(e) => {
          try {
            // Apply snapping during drag
            const node = e.target;
            const snapped = applySnapping(image.id, node.x(), node.y(), image.width, image.height);
            if (snapped && typeof snapped.x === 'number' && typeof snapped.y === 'number') {
              node.x(snapped.x);
              node.y(snapped.y);
              
              // Update snap guides
              if (Math.abs(snapped.x - node.x()) > 1 || Math.abs(snapped.y - node.y()) > 1) {
                onSnapGuides({
                  x: [snapped.x, snapped.x + image.width],
                  y: [snapped.y, snapped.y + image.height]
                });
              }
            }
          } catch (error) {
            console.error('Drag move error:', error);
          }
        }}
        onDragEnd={(e) => {
          try {
            const node = e.target;
            const snapped = applySnapping(image.id, node.x(), node.y(), image.width, image.height);
            if (snapped && typeof snapped.x === 'number' && typeof snapped.y === 'number') {
              onChange({
                x: snapped.x,
                y: snapped.y,
              });
            }
            // Clear snap guides
            onSnapGuides({x: [], y: []});
          } catch (error) {
            console.error('Drag end error:', error);
            // Clear snap guides on error too
            onSnapGuides({x: [], y: []});
          }
        }}
        onTransformStart={(e) => {
          try {
            // Show relevant snap guides when starting transform
            const node = shapeRef.current;
            if (node) {
              const snapPoints = getSnapPoints(image.id);
              if (snapPoints && snapPoints.vertical && snapPoints.horizontal) {
                onSnapGuides({
                  x: snapPoints.vertical.slice(0, 10), // Limit to prevent performance issues
                  y: snapPoints.horizontal.slice(0, 10)
                });
              }
            }
          } catch (error) {
            console.error('Transform start error:', error);
            onSnapGuides({x: [], y: []});
          }
        }}
        onTransform={(e) => {
          // Apply snapping during transform
          const node = shapeRef.current;
          if (node) {
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            
            // Calculate current dimensions
            const newWidth = Math.max(5, image.width * scaleX);
            const newHeight = Math.max(5, image.height * scaleY);
            
            // Get the bounding box after transform
            const box = node.getClientRect();
            
            // Apply snapping to the transformed bounds
            const snapped = applySnapping(image.id, box.x, box.y, box.width, box.height);
            
            // Adjust position based on snapping
            if (Math.abs(box.x - snapped.x) > 1 || Math.abs(box.y - snapped.y) > 1) {
              node.x(node.x() + (snapped.x - box.x));
              node.y(node.y() + (snapped.y - box.y));
              
              // Show active snap guides
              onSnapGuides({
                x: [snapped.x, snapped.x + box.width],
                y: [snapped.y, snapped.y + box.height]
              });
            }
          }
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          if (node) {
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            
            const newWidth = Math.max(5, node.width() * scaleX);
            const newHeight = Math.max(5, node.height() * scaleY);
            
            node.scaleX(1);
            node.scaleY(1);
            
            const snapped = applySnapping(image.id, node.x(), node.y(), newWidth, newHeight);
            
            onChange({
              x: snapped.x,
              y: snapped.y,
              width: newWidth,
              height: newHeight,
              rotation: node.rotation(),
            });
            
            // Clear snap guides
            onSnapGuides({x: [], y: []});
          }
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          flipEnabled={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};

export default function PDFCanvasEditor() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [selectedPages, setSelectedPages] = useState<PageInfo[]>([]);
  const [canvasImages, setCanvasImages] = useState<CanvasImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState<boolean>(false);
  const [cropRect, setCropRect] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [activeSnapGuides, setActiveSnapGuides] = useState<{x: number[], y: number[]}>({x: [], y: []});
  const stageRef = useRef<Konva.Stage>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Snapping configuration
  const SNAP_TOLERANCE = 10;
  const GRID_SIZE = 20;

  // Snapping utility functions
  const snapToGrid = (value: number) => {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  };

  const snapToValue = (value: number, snapPoints: number[], tolerance = SNAP_TOLERANCE) => {
    for (const point of snapPoints) {
      if (Math.abs(value - point) <= tolerance) {
        return point;
      }
    }
    return value;
  };

  const getSnapPoints = (excludeId?: string) => {
    const snapPoints = {
      vertical: [0, canvasSize.width, canvasSize.width / 2], // Canvas edges and center
      horizontal: [0, canvasSize.height, canvasSize.height / 2]
    };

    // Add snap points from other images
    canvasImages
      .filter(img => img.id !== excludeId)
      .forEach(img => {
        // Vertical snap points (left, center, right edges of images)
        snapPoints.vertical.push(img.x);
        snapPoints.vertical.push(img.x + img.width / 2);
        snapPoints.vertical.push(img.x + img.width);
        
        // Horizontal snap points (top, center, bottom edges of images)
        snapPoints.horizontal.push(img.y);
        snapPoints.horizontal.push(img.y + img.height / 2);
        snapPoints.horizontal.push(img.y + img.height);
      });

    return snapPoints;
  };

  const applySnapping = (imageId: string, newX: number, newY: number, width: number, height: number) => {
    // Always return valid coordinates, even if snapping is disabled
    if (!snapEnabled || !canvasSize.width || !canvasSize.height) {
      return { x: newX, y: newY };
    }

    try {
      const snapPoints = getSnapPoints(imageId);
      
      // Ensure we have valid snap points
      if (!snapPoints || !snapPoints.vertical || !snapPoints.horizontal) {
        return { x: newX, y: newY };
      }
      
      // Calculate key points of the image
      const left = newX;
      const right = newX + width;
      const centerX = newX + width / 2;
      const top = newY;
      const bottom = newY + height;
      const centerY = newY + height / 2;
      
      // Test different snap scenarios with priority to closer snaps
      const snapScenarios = [
        // Left edge snapping
        { 
          x: snapToValue(left, snapPoints.vertical), 
          y: snapToValue(top, snapPoints.horizontal),
          priority: 1
        },
        // Right edge snapping  
        { 
          x: snapToValue(right, snapPoints.vertical) - width, 
          y: snapToValue(top, snapPoints.horizontal),
          priority: 1
        },
        // Center X snapping
        { 
          x: snapToValue(centerX, snapPoints.vertical) - width / 2, 
          y: snapToValue(centerY, snapPoints.horizontal) - height / 2,
          priority: 2
        },
        // Bottom edge snapping
        { 
          x: snapToValue(left, snapPoints.vertical), 
          y: snapToValue(bottom, snapPoints.horizontal) - height,
          priority: 1
        }
      ];

      // Find the best snap with minimum movement, considering priority
      let bestSnap = { x: newX, y: newY };
      let minDistance = Infinity;

      snapScenarios.forEach(scenario => {
        const distanceX = Math.abs(scenario.x - newX);
        const distanceY = Math.abs(scenario.y - newY);
        const totalDistance = distanceX + distanceY;
        
        // Only consider snaps within tolerance
        if (distanceX <= SNAP_TOLERANCE || distanceY <= SNAP_TOLERANCE) {
          // Prioritize edge snaps over center snaps
          const adjustedDistance = totalDistance + (scenario.priority - 1) * 5;
          
          if (adjustedDistance < minDistance && adjustedDistance < 50) {
            minDistance = adjustedDistance;
            bestSnap = { x: scenario.x, y: scenario.y };
          }
        }
      });

      return bestSnap;
    } catch (error) {
      console.error('Snapping error:', error);
      return { x: newX, y: newY };
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      await extractPages(file);
    }
  };

  const extractPages = async (file: File) => {
    // Dynamically import PDF.js on client-side only
    const pdfjsLib = await import('pdfjs-dist');
    
    // Set worker source to local file
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const extractedPages: PageInfo[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (context) {
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;

        extractedPages.push({
          pageNumber: pageNum,
          canvas: canvas,
          selected: false
        });
      }
    }

    setPages(extractedPages);
  };

  const togglePageSelection = (pageIndex: number) => {
    const updatedPages = pages.map((page, index) => 
      index === pageIndex ? { ...page, selected: !page.selected } : page
    );
    setPages(updatedPages);

    const newSelectedPages = updatedPages.filter(page => page.selected);
    setSelectedPages(newSelectedPages);
  };

  const addImageToCanvas = (pageInfo: PageInfo) => {
    try {
      const newImage: CanvasImage = {
        id: `img-${Date.now()}-${Math.random()}`,
        src: pageInfo.canvas.toDataURL(),
        x: Math.random() * 200,
        y: Math.random() * 200,
        width: pageInfo.canvas.width * 0.3,
        height: pageInfo.canvas.height * 0.3,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      };
      setCanvasImages(prev => [...prev, newImage]);
    } catch (error) {
      console.error('Error adding image to canvas:', error);
    }
  };

  const exportCanvas = () => {
    if (stageRef.current) {
      // Hide grid and guide layers during export
      const gridLayer = stageRef.current.findOne('.grid-layer');
      const guideLayer = stageRef.current.findOne('.guide-layer');
      
      if (gridLayer) gridLayer.visible(false);
      if (guideLayer) guideLayer.visible(false);
      
      const dataURL = stageRef.current.toDataURL({
        mimeType: 'image/png',
        quality: 1,
        pixelRatio: 3 // High resolution
      });
      
      // Restore visibility
      if (gridLayer) gridLayer.visible(true);
      if (guideLayer) guideLayer.visible(true);
      
      const link = document.createElement('a');
      link.download = 'canvas-export.png';
      link.href = dataURL;
      link.click();
    }
  };

  const cropImage = () => {
    if (selectedImageId && !cropMode) {
      setCropMode(true);
      const selectedImage = canvasImages.find(img => img.id === selectedImageId);
      if (selectedImage) {
        setCropRect({
          x: selectedImage.x + 20,
          y: selectedImage.y + 20,
          width: selectedImage.width - 40,
          height: selectedImage.height - 40
        });
      }
    } else if (cropMode) {
      // Apply the crop
      applyCrop();
    } else {
      alert('Please select an image first');
    }
  };

  const applyCrop = () => {
    if (selectedImageId && cropRect) {
      const selectedImage = canvasImages.find(img => img.id === selectedImageId);
      if (selectedImage) {
        // Create a canvas to crop the image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
          // Calculate crop dimensions relative to original image
          const scaleX = img.width / selectedImage.width;
          const scaleY = img.height / selectedImage.height;
          
          const cropX = (cropRect.x - selectedImage.x) * scaleX;
          const cropY = (cropRect.y - selectedImage.y) * scaleY;
          const cropWidth = cropRect.width * scaleX;
          const cropHeight = cropRect.height * scaleY;
          
          canvas.width = cropWidth;
          canvas.height = cropHeight;
          
          if (ctx) {
            ctx.drawImage(
              img,
              Math.max(0, cropX),
              Math.max(0, cropY),
              cropWidth,
              cropHeight,
              0,
              0,
              cropWidth,
              cropHeight
            );
            
            // Update the image with cropped version
            updateImage(selectedImageId, {
              src: canvas.toDataURL(),
              x: cropRect.x,
              y: cropRect.y,
              width: cropRect.width,
              height: cropRect.height
            });
          }
          
          setCropMode(false);
          setCropRect(null);
        };
        
        img.src = selectedImage.src;
      }
    }
  };

  const cancelCrop = () => {
    setCropMode(false);
    setCropRect(null);
  };

  const deleteSelected = () => {
    if (selectedImageId) {
      setCanvasImages(prev => prev.filter(img => img.id !== selectedImageId));
      setSelectedImageId(null);
    }
  };

  const updateImage = useCallback((id: string, newAttrs: Partial<CanvasImage>) => {
    setCanvasImages(prev => 
      prev.map(img => img.id === id ? { ...img, ...newAttrs } : img)
    );
  }, []);

  const selectImage = useCallback((id: string) => {
    setSelectedImageId(id);
  }, []);

  const checkDeselect = (e: any) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      setSelectedImageId(null);
    }
  };

  // Get viewport dimensions
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateCanvasSize = () => {
      setCanvasSize({
        width: window.innerWidth,
        height: window.innerHeight - (selectedPages.length > 0 ? 180 : 120) // Account for header and bottom bar
      });
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [selectedPages.length]);

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Header - Fixed at top */}
      <div className="flex-shrink-0 bg-white shadow-sm p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">PDF Canvas Editor</h1>
          
          {/* File Upload */}
          <div className="flex items-center space-x-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium"
            >
              Upload PDF
            </button>
            {pdfFile && (
              <span className="text-gray-600 text-sm">
                {pdfFile.name}
              </span>
            )}
            
            {/* Canvas Controls */}
            <div className="flex space-x-2">
              <button
                onClick={() => setSnapEnabled(!snapEnabled)}
                className={`px-3 py-2 rounded text-white text-sm ${
                  snapEnabled 
                    ? 'bg-blue-500 hover:bg-blue-600' 
                    : 'bg-gray-400 hover:bg-gray-500'
                }`}
                title={snapEnabled ? 'Snap: ON' : 'Snap: OFF'}
              >
                📌 {snapEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={cropImage}
                className={`px-3 py-2 rounded text-white text-sm ${
                  cropMode 
                    ? 'bg-orange-500 hover:bg-orange-600' 
                    : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {cropMode ? 'Apply Crop' : 'Crop'}
              </button>
              {cropMode && (
                <button
                  onClick={cancelCrop}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={deleteSelected}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm"
                disabled={cropMode}
              >
                Delete
              </button>
              <button
                onClick={exportCanvas}
                className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-2 rounded text-sm"
                disabled={cropMode}
              >
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Page Selection Modal - Show when pages are available but none selected */}
      {pages.length > 0 && selectedPages.length === 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl max-h-3/4 overflow-auto">
            <h2 className="text-xl font-semibold mb-4">Select Pages to Import</h2>
            <div className="grid grid-cols-4 gap-4 max-h-96 overflow-y-auto">
              {pages.map((page, index) => (
                <div
                  key={index}
                  className={`border-2 rounded-lg p-2 cursor-pointer transition-all ${
                    page.selected ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                  }`}
                  onClick={() => togglePageSelection(index)}
                >
                  <img
                    src={page.canvas.toDataURL()}
                    alt={`Page ${page.pageNumber}`}
                    className="w-full h-auto rounded"
                  />
                  <p className="text-center mt-2 text-sm">Page {page.pageNumber}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSelectedPages(pages.filter(p => p.selected))}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
                disabled={!pages.some(p => p.selected)}
              >
                Continue with Selected Pages
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Canvas Area */}
      <div className="flex-1 bg-gray-900 overflow-hidden">
        <Stage
          ref={stageRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={checkDeselect}
          onTouchStart={checkDeselect}
        >
          {/* Grid and Guide Layer (excluded from export) */}
          <Layer name="grid-layer">
            {/* Grid overlay when snapping is enabled */}
            {snapEnabled && (
              <>
                {Array.from({ length: Math.ceil(canvasSize.width / GRID_SIZE) }, (_, i) => (
                  <Rect
                    key={`grid-v-${i}`}
                    x={i * GRID_SIZE}
                    y={0}
                    width={1}
                    height={canvasSize.height}
                    fill="#444444"
                    opacity={0.3}
                  />
                ))}
                {Array.from({ length: Math.ceil(canvasSize.height / GRID_SIZE) }, (_, i) => (
                  <Rect
                    key={`grid-h-${i}`}
                    x={0}
                    y={i * GRID_SIZE}
                    width={canvasSize.width}
                    height={1}
                    fill="#444444"
                    opacity={0.3}
                  />
                ))}
                {/* Center guides */}
                <Rect
                  x={canvasSize.width / 2 - 0.5}
                  y={0}
                  width={1}
                  height={canvasSize.height}
                  fill="#ff6b6b"
                  opacity={0.6}
                />
                <Rect
                  x={0}
                  y={canvasSize.height / 2 - 0.5}
                  width={canvasSize.width}
                  height={1}
                  fill="#ff6b6b"
                  opacity={0.6}
                />
              </>
            )}
          </Layer>

          {/* Content Layer (included in export) */}
          <Layer name="content-layer">
            {canvasImages.map((image) => (
              <CanvasImageComponent
                key={image.id}
                image={image}
                isSelected={image.id === selectedImageId && !cropMode}
                onSelect={() => !cropMode && selectImage(image.id)}
                onChange={(newAttrs) => !cropMode && updateImage(image.id, newAttrs)}
                applySnapping={applySnapping}
                onSnapGuides={setActiveSnapGuides}
                getSnapPoints={getSnapPoints}
                snapTolerance={SNAP_TOLERANCE}
              />
            ))}
          </Layer>

          {/* Active Snap Guide Layer (excluded from export) */}
          <Layer name="guide-layer">
            {/* Active snap guides */}
            {snapEnabled && activeSnapGuides.x.map((x, i) => (
              <Rect
                key={`snap-guide-x-${i}`}
                x={x}
                y={0}
                width={2}
                height={canvasSize.height}
                fill="#00ff00"
                opacity={0.8}
              />
            ))}
            {snapEnabled && activeSnapGuides.y.map((y, i) => (
              <Rect
                key={`snap-guide-y-${i}`}
                x={0}
                y={y}
                width={canvasSize.width}
                height={2}
                fill="#00ff00"
                opacity={0.8}
              />
            ))}

            {/* Crop rectangle (excluded from export) */}
            {cropMode && cropRect && (
              <>
                <Rect
                  x={cropRect.x}
                  y={cropRect.y}
                  width={cropRect.width}
                  height={cropRect.height}
                  fill="transparent"
                  stroke="red"
                  strokeWidth={2}
                  strokeDashArray={[5, 5]}
                  draggable
                  onDragEnd={(e) => {
                    setCropRect({
                      ...cropRect,
                      x: e.target.x(),
                      y: e.target.y()
                    });
                  }}
                />
                <Transformer
                  nodes={stageRef.current?.findOne('Rect') ? [stageRef.current.findOne('Rect')] : []}
                  onTransformEnd={(e) => {
                    const node = e.target;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    
                    node.scaleX(1);
                    node.scaleY(1);
                    
                    setCropRect({
                      x: node.x(),
                      y: node.y(),
                      width: Math.max(10, node.width() * scaleX),
                      height: Math.max(10, node.height() * scaleY)
                    });
                  }}
                />
              </>
            )}
          </Layer>
        </Stage>
      </div>

      {/* Fixed Bottom Bar - Selected Pages */}
      {selectedPages.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 shadow-lg p-4 z-40">
          <h3 className="text-sm font-semibold mb-2 text-gray-700">Click images to add to canvas:</h3>
          <div className="flex space-x-3 overflow-x-auto pb-2" style={{ maxHeight: '120px' }}>
            {selectedPages.map((page, index) => (
              <div
                key={index}
                className="flex-shrink-0 border-2 border-gray-300 rounded-lg p-2 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
                onClick={() => addImageToCanvas(page)}
              >
                <img
                  src={page.canvas.toDataURL()}
                  alt={`Selected Page ${page.pageNumber}`}
                  className="w-16 h-20 object-contain rounded"
                />
                <p className="text-center mt-1 text-xs text-gray-600">Page {page.pageNumber}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}