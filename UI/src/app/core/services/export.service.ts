import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ExportService {
  constructor(@Inject(DOCUMENT) private readonly documentRef: Document) {}

  exportJson(fileName: string, data: unknown): void {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    this.triggerDownload(fileName, URL.createObjectURL(blob));
  }

  async exportSvgAsPng(svg: SVGElement, fileName: string): Promise<void> {
    const serializer = new XMLSerializer();
    const clonedSvg = svg.cloneNode(true) as SVGElement;
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const svgString = serializer.serializeToString(clonedSvg);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const image = new Image();
    const canvas = this.documentRef.createElement('canvas');
    canvas.width = Number(svg.getAttribute('width')) || 1000;
    canvas.height = Number(svg.getAttribute('height')) || 600;

    await new Promise((resolve) => {
      image.onload = () => {
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(null);
          return;
        }
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        URL.revokeObjectURL(url);
        resolve(null);
      };
      image.src = url;
    });

    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      const blobUrl = URL.createObjectURL(blob);
      this.triggerDownload(fileName, blobUrl);
    });
  }

  private triggerDownload(fileName: string, href: string): void {
    const link = this.documentRef.createElement('a');
    link.href = href;
    link.download = fileName;
    link.style.display = 'none';
    this.documentRef.body.appendChild(link);
    link.click();
    this.documentRef.body.removeChild(link);
    URL.revokeObjectURL(href);
  }
}
